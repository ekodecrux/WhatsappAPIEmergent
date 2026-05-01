import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Palette, Globe, Plus, X, Check, Loader2, Trash2, Copy, ExternalLink, ShieldCheck, AlertTriangle, Code2 } from 'lucide-react';
import { toast } from 'sonner';

const COLOR_PRESETS = ['#16A34A', '#075E54', '#2563EB', '#9333EA', '#DC2626', '#EA580C', '#0891B2', '#0F766E'];

export default function Branding() {
  const [tab, setTab] = useState('brand');
  const [brand, setBrand] = useState({});
  const [domains, setDomains] = useState([]);
  const [cnameTarget, setCnameTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [newHost, setNewHost] = useState('');
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyResult, setVerifyResult] = useState({});

  const load = async () => {
    const { data } = await api.get('/branding');
    setBrand(data.branding || {});
    setDomains(data.domains || []);
    setCnameTarget(data.cname_target || '');
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/branding', brand);
      toast.success('Branding saved — refresh to see changes on custom domain');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const addDomain = async () => {
    if (!newHost.trim()) return;
    try {
      await api.post('/branding/domains', { hostname: newHost.trim() });
      toast.success('Domain added — verify DNS to activate');
      setNewHost('');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed to add domain'); }
  };

  const verify = async (d) => {
    setVerifyingId(d.id);
    setVerifyResult({});
    try {
      const { data } = await api.post(`/branding/domains/${d.id}/verify`);
      setVerifyResult({ id: d.id, ...data });
      if (data.verified) { toast.success('Domain verified!'); load(); }
      else toast.error(data.reason || 'Not verified yet');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Verify failed'); }
    finally { setVerifyingId(null); }
  };

  const remove = async (d) => {
    if (!window.confirm(`Remove ${d.hostname}?`)) return;
    await api.delete(`/branding/domains/${d.id}`);
    toast.success('Domain removed');
    load();
  };

  const copy = (txt) => {
    navigator.clipboard.writeText(txt);
    toast.success('Copied');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Branding & Custom Domain</h1>
        <p className="mt-1 text-sm text-zinc-600">
          White-label your tenant portal — set your logo, brand colors, and map your own domain.
        </p>
      </div>

      <div className="flex border-b border-zinc-200">
        {[
          { id: 'brand', label: 'Brand & Theme', icon: Palette },
          { id: 'domains', label: 'Custom Domains', icon: Globe },
        ].map(t => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.id ? 'border-b-2 border-wa-dark text-wa-dark' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'brand' && (
        <div className="space-y-4 rounded-md border border-zinc-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Brand name</label>
              <input
                data-testid="brand-name"
                value={brand.brand_name || ''}
                onChange={(e) => setBrand({ ...brand, brand_name: e.target.value })}
                placeholder="Acme Corp"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Primary color</label>
              <div className="flex items-center gap-2">
                <input
                  data-testid="brand-color"
                  type="text"
                  value={brand.primary_color || ''}
                  onChange={(e) => setBrand({ ...brand, primary_color: e.target.value })}
                  placeholder="#16A34A"
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
                />
                <div className="h-8 w-8 rounded-md border border-zinc-300" style={{ background: brand.primary_color || '#fff' }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBrand({ ...brand, primary_color: c })}
                    className="h-5 w-5 rounded-full border border-zinc-300 transition hover:scale-110"
                    style={{ background: c }}
                    aria-label={`Pick color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Logo URL</label>
            <input
              data-testid="brand-logo"
              value={brand.logo_url || ''}
              onChange={(e) => setBrand({ ...brand, logo_url: e.target.value })}
              placeholder="https://your-cdn.com/logo.png"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            {brand.logo_url && (
              <div className="mt-2 inline-flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-2">
                <img src={brand.logo_url} alt="logo preview" className="h-8 max-w-[160px] object-contain" />
                <span className="text-xs text-zinc-500">preview</span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Favicon URL</label>
            <input
              value={brand.favicon_url || ''}
              onChange={(e) => setBrand({ ...brand, favicon_url: e.target.value })}
              placeholder="https://your-cdn.com/favicon.ico"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Login-page hero text</label>
            <textarea
              rows={2}
              value={brand.login_hero_text || ''}
              onChange={(e) => setBrand({ ...brand, login_hero_text: e.target.value })}
              placeholder="Welcome back to Acme — let's send some messages."
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700">
              <Code2 className="h-3 w-3" /> Custom CSS (advanced)
            </label>
            <textarea
              data-testid="brand-css"
              rows={6}
              value={brand.custom_css || ''}
              onChange={(e) => setBrand({ ...brand, custom_css: e.target.value })}
              placeholder=":root { --brand-primary: #16A34A; }&#10;.sidebar-logo { font-family: 'Inter', sans-serif; }"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs"
            />
            <p className="mt-1 text-[10px] text-amber-700">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              CSS injection is powerful — broken selectors can hide UI. Test on your custom domain before relying on it.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              data-testid="brand-save"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save branding
            </button>
          </div>
        </div>
      )}

      {tab === 'domains' && (
        <div className="space-y-4">
          <div className="rounded-md border border-zinc-200 bg-white p-5">
            <h3 className="mb-2 font-display text-lg font-semibold">Add a custom domain</h3>
            <p className="mb-3 text-xs text-zinc-600">
              Use your own domain (e.g. <span className="font-mono">chat.acme.com</span>) for the tenant portal.
              You'll add a CNAME and a TXT record at your DNS provider.
            </p>
            <div className="flex gap-2">
              <input
                data-testid="new-domain-input"
                value={newHost}
                onChange={(e) => setNewHost(e.target.value)}
                placeholder="chat.acme.com"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
              />
              <button
                data-testid="add-domain"
                onClick={addDomain}
                className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>

          {domains.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 bg-white p-12 text-center">
              <Globe className="mx-auto mb-2 h-6 w-6 text-zinc-400" />
              <p className="text-sm text-zinc-500">No custom domains yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {domains.map(d => {
                const vr = verifyResult.id === d.id ? verifyResult : null;
                return (
                  <div key={d.id} data-testid={`domain-${d.id}`} className="rounded-md border border-zinc-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-zinc-900">{d.hostname}</span>
                          <StatusPill status={d.status} />
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          Added {new Date(d.created_at).toLocaleDateString()} {d.verified_at && `· verified ${new Date(d.verified_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {d.status !== 'verified' && d.status !== 'revoked' && (
                          <button
                            data-testid={`verify-${d.id}`}
                            onClick={() => verify(d)}
                            disabled={verifyingId === d.id}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            {verifyingId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Verify DNS
                          </button>
                        )}
                        {d.status === 'verified' && (
                          <a href={`https://${d.hostname}`} target="_blank" rel="noreferrer"
                             className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50">
                            <ExternalLink className="h-3 w-3" /> Open
                          </a>
                        )}
                        <button
                          data-testid={`delete-${d.id}`}
                          onClick={() => remove(d)}
                          className="rounded-md border border-zinc-300 bg-white p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {d.status !== 'verified' && d.status !== 'revoked' && (
                      <div className="mt-3 space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs">
                        <div className="font-medium text-zinc-900">Add these two DNS records at your registrar:</div>
                        <DNSRow type="TXT" host={`_wabridge.${d.hostname}`} value={d.txt_token} onCopy={() => copy(d.txt_token)} />
                        <DNSRow type="CNAME" host={d.hostname} value={d.cname_target || cnameTarget} onCopy={() => copy(d.cname_target || cnameTarget)} />
                        <p className="pt-1 text-[11px] text-zinc-600">
                          DNS changes can take up to 1 hour to propagate. After it's set up, click <span className="font-medium">Verify DNS</span> above.
                        </p>
                      </div>
                    )}

                    {vr && !vr.verified && (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        <AlertTriangle className="mr-1 inline h-3 w-3" /> {vr.reason}
                        {vr.found_records?.length > 0 && (
                          <div className="mt-1 font-mono text-[10px] text-amber-800">
                            Found: {vr.found_records.slice(0, 3).join(', ')}
                          </div>
                        )}
                      </div>
                    )}

                    {d.status === 'revoked' && (
                      <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                        <AlertTriangle className="mr-1 inline h-3 w-3" /> Revoked by platform admin
                        {d.revoke_reason && <span className="ml-1">— {d.revoke_reason}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    pending: { c: 'bg-amber-100 text-amber-800', label: 'pending verification' },
    verified: { c: 'bg-green-100 text-green-800', label: 'active' },
    revoked: { c: 'bg-red-100 text-red-800', label: 'revoked' },
  };
  const m = map[status] || map.pending;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.c}`}>{m.label}</span>;
}

function DNSRow({ type, host, value, onCopy }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2">
      <div className="col-span-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{type}</div>
      <div className="col-span-4 truncate font-mono text-[11px] text-zinc-800">{host}</div>
      <div className="col-span-5 truncate rounded bg-white px-2 py-1 font-mono text-[11px] text-zinc-700 ring-1 ring-zinc-200">{value}</div>
      <button onClick={onCopy} className="col-span-1 rounded p-1 text-zinc-500 hover:bg-zinc-200">
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}
