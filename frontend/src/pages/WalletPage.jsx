import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import {
  Wallet, Plus, ArrowDownRight, ArrowUpRight, Sparkles, AlertTriangle, RefreshCcw, Settings, X, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

const TYPE_STYLE = {
  topup: { icon: ArrowUpRight, label: 'Top-up', cls: 'text-green-700' },
  admin_credit: { icon: ArrowUpRight, label: 'Admin credit', cls: 'text-green-700' },
  debit: { icon: ArrowDownRight, label: 'Message', cls: 'text-zinc-700' },
  refund: { icon: ArrowUpRight, label: 'Refund', cls: 'text-blue-700' },
  free: { icon: Sparkles, label: 'Free (service)', cls: 'text-zinc-500' },
  admin_debit: { icon: ArrowDownRight, label: 'Admin debit', cls: 'text-amber-700' },
};

const QUICK_AMOUNTS = [500, 1000, 2500, 5000];

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);

export default function WalletPage() {
  const [data, setData] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState(1000);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [w, t] = await Promise.all([api.get('/wallet'), api.get('/wallet/transactions?limit=50')]);
      setData(w.data);
      setTxns(t.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const setMode = async (mode) => {
    try {
      await api.post('/wallet/billing-mode', { billing_mode: mode });
      toast.success(`Switched to ${mode === 'wallet' ? 'Wallet (we manage Meta)' : 'BYOC (your Meta account)'}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  const startTopup = async () => {
    if (topupAmount < 100) { toast.error('Minimum top-up is ₹100'); return; }
    setBusy(true);
    try {
      const { data: order } = await api.post('/wallet/topup/order', { amount_inr: Number(topupAmount) });
      const w = window;
      const open = () => {
        if (!w.Razorpay) { toast.error('Razorpay script failed to load'); setBusy(false); return; }
        const rz = new w.Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: 'wabridge',
          description: `Wallet top-up · ₹${order.amount_inr}`,
          order_id: order.order_id,
          handler: async (resp) => {
            try {
              await api.post('/wallet/topup/verify', {
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              });
              toast.success(`₹${order.amount_inr} added to your wallet`);
              setTopupOpen(false);
              load();
            } catch (e) { toast.error(e?.response?.data?.detail || 'Verification failed'); }
          },
          modal: { ondismiss: () => setBusy(false) },
          theme: { color: '#128C7E' },
        });
        rz.open();
      };
      if (!w.Razorpay) {
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = open;
        s.onerror = () => { toast.error('Failed to load Razorpay'); setBusy(false); };
        document.body.appendChild(s);
      } else open();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Top-up failed');
      setBusy(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-zinc-500">Loading wallet…</div>;
  if (!data) return null;

  const isWalletMode = data.billing_mode === 'wallet';
  const lowBalance = isWalletMode && data.wallet_balance_inr < (data.low_balance_threshold_inr || 50);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Wallet className="h-6 w-6 text-wa-dark" /> Wallet & Billing
          </h1>
          <p className="mt-1 text-sm text-zinc-600">Pay-as-you-send WhatsApp credits. Top up via Razorpay, deduct per conversation.</p>
        </div>
        <button data-testid="wallet-refresh" onClick={load} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs"><RefreshCcw className="h-3.5 w-3.5" /> Refresh</button>
      </div>

      {/* Plan-mode selector */}
      <div className="grid gap-3 sm:grid-cols-2" data-testid="billing-mode-selector">
        <button
          data-testid="mode-wallet"
          onClick={() => !isWalletMode && setMode('wallet')}
          className={`text-left rounded-md border-2 p-4 transition ${isWalletMode ? 'border-wa-dark bg-wa-dark/5' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="font-display text-base font-semibold inline-flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-wa-dark" /> Wallet (we manage Meta)
              </div>
              <p className="mt-1 text-xs text-zinc-600">We handle Meta WABA. You top up, we deduct per conversation. Best for fast onboarding.</p>
              <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-600">
                <li>• ₹0.85 / marketing message · ₹0.115 / utility · service free</li>
                <li>• Auto-pause at low balance · refunds on provider failure</li>
              </ul>
            </div>
            {isWalletMode && <CheckCircle2 className="h-5 w-5 shrink-0 text-wa-dark" />}
          </div>
        </button>
        <button
          data-testid="mode-byoc"
          onClick={() => isWalletMode && setMode('byoc')}
          className={`text-left rounded-md border-2 p-4 transition ${!isWalletMode ? 'border-wa-dark bg-wa-dark/5' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="font-display text-base font-semibold inline-flex items-center gap-1.5">
                <Settings className="h-4 w-4 text-wa-dark" /> BYOC (your own Meta)
              </div>
              <p className="mt-1 text-xs text-zinc-600">You connect your Meta WABA / Twilio. You pay them directly. We charge only the platform subscription.</p>
              <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-600">
                <li>• Lowest per-message cost at scale</li>
                <li>• Best for &gt;100k msgs/month senders</li>
              </ul>
            </div>
            {!isWalletMode && <CheckCircle2 className="h-5 w-5 shrink-0 text-wa-dark" />}
          </div>
        </button>
      </div>

      {isWalletMode && (
        <>
          <div className={`rounded-md border p-5 ${lowBalance ? 'border-red-200 bg-red-50/40' : 'border-zinc-200 bg-white'}`} data-testid="wallet-balance-card">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Current balance</div>
                <div className={`mt-1 font-display text-4xl font-semibold tracking-tight ${lowBalance ? 'text-red-700' : 'text-zinc-900'}`} data-testid="wallet-balance">
                  {fmtINR(data.wallet_balance_inr)}
                </div>
                <div className="mt-1 inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
                  <span>≈ <strong>{data.estimated_marketing_messages_left.toLocaleString()}</strong> marketing msgs</span>
                  <span>or <strong>{data.estimated_utility_messages_left.toLocaleString()}</strong> utility msgs</span>
                </div>
                {lowBalance && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-100 px-2 py-1 text-[11px] font-medium text-red-800">
                    <AlertTriangle className="h-3.5 w-3.5" /> Below ₹{data.low_balance_threshold_inr} threshold — campaigns will auto-pause
                  </div>
                )}
              </div>
              <button
                data-testid="topup-btn"
                onClick={() => setTopupOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-wa-mid"
              >
                <Plus className="h-4 w-4" /> Top up wallet
              </button>
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Pricing (per conversation)</div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(data.pricing_inr).map(([cat, p]) => (
                <div key={cat} className="rounded-md border border-zinc-200 bg-zinc-50/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">{cat}</div>
                  <div className="mt-1 font-display text-lg font-semibold">{p === 0 ? 'Free' : `₹${p.toFixed(3)}`}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] text-zinc-500">Marketing = promotional broadcasts · Utility = OTPs/order updates · Service = customer-initiated within 24h.</div>
          </div>
        </>
      )}

      <div className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Recent transactions</div>
        </div>
        <div className="overflow-x-auto" data-testid="wallet-transactions">
          {txns.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-zinc-500">No transactions yet. Top up your wallet to get started.</div>
          )}
          {txns.length > 0 && (
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500"><tr>
                <th className="px-5 py-2 text-left font-semibold">Type</th>
                <th className="px-5 py-2 text-left font-semibold">Description</th>
                <th className="px-5 py-2 text-right font-semibold">Amount</th>
                <th className="px-5 py-2 text-right font-semibold">Balance after</th>
                <th className="px-5 py-2 text-left font-semibold">Date</th>
              </tr></thead>
              <tbody>
                {txns.map(t => {
                  const cfg = TYPE_STYLE[t.type] || TYPE_STYLE.debit;
                  const Icon = cfg.icon;
                  const positive = (t.amount_inr || 0) > 0;
                  return (
                    <tr key={t.id} className="border-t border-zinc-100">
                      <td className="px-5 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 ${cfg.cls}`}>
                          <Icon className="h-3 w-3" /> <span className="text-[11px] font-medium">{cfg.label}</span>
                        </span>
                      </td>
                      <td className="px-5 py-2.5 max-w-md truncate text-zinc-700">{t.note || '—'}</td>
                      <td className={`px-5 py-2.5 text-right font-mono font-medium ${positive ? 'text-green-700' : 'text-zinc-900'}`}>
                        {positive ? '+' : ''}{fmtINR(t.amount_inr)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-zinc-700">{fmtINR(t.balance_after)}</td>
                      <td className="px-5 py-2.5 text-zinc-500">{(t.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {topupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-h-[90vh] overflow-y-auto max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold inline-flex items-center gap-2"><Plus className="h-4 w-4 text-wa-dark" /> Top up wallet</h3>
              <button onClick={() => setTopupOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-zinc-600">Pay securely via Razorpay (UPI / cards / netbanking). Your balance is updated instantly on payment.</p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {QUICK_AMOUNTS.map(a => (
                <button
                  key={a}
                  data-testid={`topup-quick-${a}`}
                  onClick={() => setTopupAmount(a)}
                  className={`rounded-md border-2 px-3 py-2 text-sm font-semibold transition ${topupAmount === a ? 'border-wa-dark bg-wa-dark/5 text-wa-dark' : 'border-zinc-200 hover:border-zinc-400'}`}
                >₹{a.toLocaleString()}</button>
              ))}
            </div>
            <div className="mt-3">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Custom amount (₹100 – ₹100,000)</label>
              <input
                data-testid="topup-amount"
                type="number" min={100} max={100000}
                value={topupAmount}
                onChange={(e) => setTopupAmount(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono"
              />
              <div className="mt-1.5 text-[11px] text-zinc-500">
                ≈ {Math.floor(topupAmount / (data.pricing_inr.marketing || 0.85))} marketing or {Math.floor(topupAmount / (data.pricing_inr.utility || 0.115))} utility messages
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setTopupOpen(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
              <button data-testid="topup-pay" disabled={busy || topupAmount < 100} onClick={startTopup} className="inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-4 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-50">
                {busy ? 'Opening Razorpay…' : `Pay ₹${Number(topupAmount).toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
