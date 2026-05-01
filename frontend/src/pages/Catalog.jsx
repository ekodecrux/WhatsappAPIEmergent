import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Plus, X, Trash2, Edit, Package, Copy, Send } from 'lucide-react';
import { toast } from 'sonner';

const initial = { name: '', description: '', price_inr: '', image_url: '', sku: '', category: '', in_stock: true };

export default function Catalog() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingOut, setCheckingOut] = useState(null);
  const [coForm, setCoForm] = useState({ customer_phone: '', customer_name: '' });

  const load = async () => { const { data } = await api.get('/catalog/products'); setItems(data); };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, price_inr: Number(form.price_inr) };
      if (editing) await api.patch(`/catalog/products/${editing.id}`, body);
      else await api.post('/catalog/products', body);
      toast.success(editing ? 'Updated' : 'Product added');
      setOpen(false); setEditing(null); setForm(initial); load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
    finally { setBusy(false); }
  };
  const del = async (id) => {
    if (!window.confirm('Delete product?')) return;
    await api.delete(`/catalog/products/${id}`); load();
  };

  const checkout = async () => {
    if (!checkingOut) return;
    if (!coForm.customer_phone.startsWith('+')) return toast.error('Phone must be E.164 (+91…)');
    try {
      const { data } = await api.post('/catalog/checkout', {
        product_id: checkingOut.id,
        customer_phone: coForm.customer_phone,
        customer_name: coForm.customer_name,
      });
      navigator.clipboard.writeText(data.wa_message_template);
      toast.success('Pay link copied — paste it in WhatsApp');
      setCheckingOut(null); setCoForm({ customer_phone: '', customer_name: '' });
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Package className="h-6 w-6 text-wa-dark" /> Catalog
          </h1>
          <p className="mt-1 text-sm text-zinc-600">List products, generate Razorpay pay-links to send via WhatsApp.</p>
        </div>
        <button data-testid="new-product" onClick={() => { setEditing(null); setForm(initial); setOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid">
          <Plus className="h-3.5 w-3.5" /> Add product
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-white p-16 text-center">
          <Package className="mx-auto mb-2 h-6 w-6 text-zinc-400" />
          <p className="text-sm text-zinc-500">No products yet. Add your first one — generate Razorpay pay-links in seconds.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(p => (
            <div key={p.id} className="overflow-hidden rounded-md border border-zinc-200 bg-white">
              {p.image_url
                ? <img src={p.image_url} alt={p.name} className="h-40 w-full object-cover" />
                : <div className="grid h-40 place-items-center bg-zinc-100 text-zinc-400"><Package className="h-8 w-8" /></div>}
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900 truncate">{p.name}</div>
                    <div className="font-display text-lg font-semibold text-wa-dark">₹{p.price_inr.toLocaleString()}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${p.in_stock ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-600'}`}>{p.in_stock ? 'in stock' : 'sold out'}</span>
                </div>
                {p.description && <div className="line-clamp-2 text-xs text-zinc-600">{p.description}</div>}
                <div className="flex items-center gap-1 pt-1">
                  <button data-testid={`checkout-${p.id}`} onClick={() => setCheckingOut(p)}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-zinc-900 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-zinc-800">
                    <Send className="h-3 w-3" /> Generate pay-link
                  </button>
                  <button onClick={() => { setEditing(p); setForm({ ...p, price_inr: String(p.price_inr) }); setOpen(true); }}
                    className="rounded-md border border-zinc-300 bg-white p-1.5 hover:bg-zinc-50"><Edit className="h-3 w-3" /></button>
                  <button onClick={() => del(p.id)} className="rounded-md border border-zinc-300 bg-white p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{editing ? 'Edit product' : 'New product'}</h3>
              <button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={save} className="space-y-2">
              <input required placeholder="Product name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <textarea rows={2} placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input required type="number" min={1} step="any" placeholder="Price ₹" value={form.price_inr} onChange={(e) => setForm({ ...form, price_inr: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input placeholder="Image URL (optional)" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-700">
                <input type="checkbox" checked={form.in_stock} onChange={(e) => setForm({ ...form, in_stock: e.target.checked })} /> In stock
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
                <button data-testid="product-save" disabled={busy} className="rounded-md bg-wa-dark px-3 py-2 text-sm text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {checkingOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCheckingOut(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Send pay-link for {checkingOut.name}</h3>
              <button onClick={() => setCheckingOut(null)}><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-zinc-600">We'll create a Razorpay order for ₹{checkingOut.price_inr} and copy a ready-to-paste WhatsApp message to your clipboard.</p>
            <input required placeholder="Customer phone (+91…)" value={coForm.customer_phone} onChange={(e) => setCoForm({ ...coForm, customer_phone: e.target.value })} className="mb-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            <input placeholder="Customer name (optional)" value={coForm.customer_name} onChange={(e) => setCoForm({ ...coForm, customer_name: e.target.value })} className="mb-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            <button data-testid="generate-paylink" onClick={checkout} className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              <Copy className="h-3.5 w-3.5" /> Generate &amp; copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
