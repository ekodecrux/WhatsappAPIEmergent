import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Shield, ShieldCheck, ShieldOff, KeyRound, Loader2, AlertTriangle, CheckCircle2, Copy, RefreshCcw, Clock, Activity } from 'lucide-react';
import { toast } from 'sonner';

const ROLE_COLORS = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  marketing_manager: 'bg-teal-100 text-teal-800',
  support_agent: 'bg-amber-100 text-amber-800',
  billing_manager: 'bg-emerald-100 text-emerald-800',
  viewer: 'bg-zinc-100 text-zinc-700',
  member: 'bg-zinc-100 text-zinc-700',
};

export default function Security() {
  const { user } = useAuth();
  const [tab, setTab] = useState('mfa');
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <Shield className="h-6 w-6 text-wa-dark" /> Security & Compliance
        </h1>
        <p className="mt-1 text-sm text-zinc-600">Two-factor auth, audit trail, and inactive-user policy — all SOC 2 Type 1 aligned.</p>
      </div>

      <div className="flex border-b border-zinc-200">
        {[
          { id: 'mfa', label: 'Two-Factor (MFA)', icon: KeyRound },
          ...(isAdmin ? [
            { id: 'audit', label: 'Audit Trail', icon: Activity },
            { id: 'inactive', label: 'Inactive Users', icon: Clock },
          ] : []),
        ].map(t => (
          <button
            key={t.id}
            data-testid={`sec-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.id ? 'border-b-2 border-wa-dark text-wa-dark' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'mfa' && <MfaPanel />}
      {tab === 'audit' && isAdmin && <AuditPanel />}
      {tab === 'inactive' && isAdmin && <InactiveUsersPanel />}
    </div>
  );
}

function MfaPanel() {
  const [status, setStatus] = useState(null);
  const [enrolling, setEnrolling] = useState(null); // {secret, qr_data_url}
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState(null);
  const [disableForm, setDisableForm] = useState({ password: '', code: '' });
  const [showDisable, setShowDisable] = useState(false);

  const load = async () => {
    const { data } = await api.get('/mfa/status');
    setStatus(data);
  };
  useEffect(() => { load(); }, []);

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/mfa/enroll');
      setEnrolling(data);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed to start enrollment'); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      const { data } = await api.post('/mfa/verify-enroll', { code });
      setBackupCodes(data.backup_codes);
      setEnrolling(null);
      setCode('');
      toast.success('MFA enabled — save your backup codes!');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Invalid code'); }
    finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await api.post('/mfa/disable', disableForm);
      toast.success('MFA disabled');
      setShowDisable(false);
      setDisableForm({ password: '', code: '' });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
    finally { setBusy(false); }
  };

  const copy = (txt) => { navigator.clipboard.writeText(txt); toast.success('Copied'); };

  if (!status) return <div className="p-6 text-center text-sm text-zinc-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-zinc-200 bg-white p-5" data-testid="mfa-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2">
              {status.mfa_enabled ? <ShieldCheck className="h-5 w-5 text-green-600" /> : <ShieldOff className="h-5 w-5 text-zinc-400" />}
              <span className="font-medium text-zinc-900">{status.mfa_enabled ? 'Two-factor is enabled' : 'Two-factor is disabled'}</span>
              {status.required_by_role && !status.mfa_enabled && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">REQUIRED for your role</span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-600">
              {status.mfa_enabled
                ? `${status.backup_codes_remaining} backup codes remaining. You'll be asked for a 6-digit code at every login.`
                : 'Protect your account with a TOTP app (Google Authenticator, 1Password, Authy).'}
            </p>
          </div>
          {!status.mfa_enabled && !enrolling && (
            <button data-testid="mfa-start" onClick={start} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-60">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Enable MFA
            </button>
          )}
          {status.mfa_enabled && !showDisable && (
            <button data-testid="mfa-show-disable" onClick={() => setShowDisable(true)} className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">
              <ShieldOff className="h-3 w-3" /> Disable MFA
            </button>
          )}
        </div>

        {enrolling && (
          <div className="mt-5 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-medium text-zinc-900">Step 1 — Scan this QR in your authenticator app:</div>
            <img src={enrolling.qr_data_url} alt="MFA QR code" className="h-48 w-48 rounded border border-zinc-200 bg-white p-2" data-testid="mfa-qr" />
            <details className="text-xs text-zinc-600">
              <summary className="cursor-pointer">Can't scan? Enter this key manually</summary>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded bg-white px-2 py-1 font-mono text-xs">{enrolling.secret}</code>
                <button onClick={() => copy(enrolling.secret)} className="rounded p-1 hover:bg-zinc-200"><Copy className="h-3 w-3" /></button>
              </div>
            </details>
            <div className="pt-2 text-sm font-medium text-zinc-900">Step 2 — Enter the 6-digit code:</div>
            <div className="flex items-center gap-2">
              <input
                data-testid="mfa-enroll-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-40 rounded-md border border-zinc-300 px-3 py-2 text-center font-mono tracking-[0.3em]"
                inputMode="numeric"
              />
              <button data-testid="mfa-verify" onClick={verify} disabled={code.length !== 6 || busy} className="rounded-md bg-wa-dark px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                {busy ? 'Verifying…' : 'Verify & Enable'}
              </button>
              <button onClick={() => { setEnrolling(null); setCode(''); }} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {showDisable && (
          <div className="mt-5 space-y-3 rounded-md border border-red-200 bg-red-50 p-4">
            <div className="text-sm font-medium text-red-900">Confirm — disable MFA</div>
            <input
              type="password"
              placeholder="Your current password"
              value={disableForm.password}
              onChange={(e) => setDisableForm({ ...disableForm, password: e.target.value })}
              className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm"
              data-testid="mfa-disable-password"
            />
            <input
              placeholder="6-digit code or backup code"
              value={disableForm.code}
              onChange={(e) => setDisableForm({ ...disableForm, code: e.target.value })}
              className="w-full rounded-md border border-red-300 bg-white px-3 py-2 font-mono text-sm"
              data-testid="mfa-disable-code"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDisable(false)} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm">Cancel</button>
              <button data-testid="mfa-disable-confirm" onClick={disable} disabled={busy} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                {busy ? 'Disabling…' : 'Disable MFA'}
              </button>
            </div>
          </div>
        )}

        {backupCodes && (
          <div className="mt-5 space-y-2 rounded-md border border-green-200 bg-green-50 p-4">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-green-900"><CheckCircle2 className="h-4 w-4" /> Save these backup codes somewhere safe</div>
            <p className="text-xs text-green-900">They won't be shown again. Each code works once if you lose your phone.</p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              {backupCodes.map((c, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-green-200 bg-white px-2.5 py-1.5">
                  <code className="font-mono text-xs">{c}</code>
                  <button onClick={() => copy(c)} className="text-zinc-500 hover:text-zinc-800"><Copy className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
            <button onClick={() => copy(backupCodes.join('\n'))} className="mt-2 text-xs text-green-800 underline">Copy all</button>
            <div className="pt-2">
              <button data-testid="mfa-backup-done" onClick={() => setBackupCodes(null)} className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white">
                I've saved them — dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
        <div className="mb-1 font-semibold text-zinc-900">Why MFA matters (SOC 2 / RBAC-F7)</div>
        Owner, Admin, and Billing Manager roles <b>must</b> enable MFA within 30 days of joining. TOTP codes from your phone defeat password-theft attacks (the #1 cause of SaaS breaches).
      </div>
    </div>
  );
}

function AuditPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ method: '', endpoint_contains: '' });

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.method) params.method = filter.method;
      if (filter.endpoint_contains) params.endpoint_contains = filter.endpoint_contains;
      const { data } = await api.get('/security/audit-logs', { params: { limit: 200, ...params } });
      setRows(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const METHOD_COLOR = { POST: 'bg-blue-100 text-blue-800', PATCH: 'bg-amber-100 text-amber-800', PUT: 'bg-amber-100 text-amber-800', DELETE: 'bg-red-100 text-red-800' };

  return (
    <div className="space-y-3" data-testid="audit-panel">
      <div className="flex items-center gap-2">
        <select value={filter.method} onChange={(e) => setFilter({ ...filter, method: e.target.value })} className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs">
          <option value="">All methods</option>
          <option>POST</option><option>PATCH</option><option>PUT</option><option>DELETE</option>
        </select>
        <input
          value={filter.endpoint_contains}
          onChange={(e) => setFilter({ ...filter, endpoint_contains: e.target.value })}
          placeholder="Filter by endpoint…"
          className="flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
        />
        <button onClick={load} className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800">
          <RefreshCcw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">No audit entries match.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Endpoint</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">ms</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-zinc-50">
                  <td className="px-3 py-1.5 text-zinc-600">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                  <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 font-semibold ${METHOD_COLOR[r.method] || 'bg-zinc-100'}`}>{r.method}</span></td>
                  <td className="px-3 py-1.5 font-mono">{r.endpoint}</td>
                  <td className="px-3 py-1.5 text-zinc-600">{r.user_id ? r.user_id.slice(0, 8) : 'anon'}</td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${String(r.response_status).startsWith('2') ? 'bg-green-100 text-green-800' : String(r.response_status).startsWith('4') ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                      {r.response_status || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-zinc-500">{r.duration_ms}</td>
                  <td className="px-3 py-1.5 text-zinc-500">{r.ip_address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[10px] text-zinc-500">Immutable audit trail · 365-day TTL · SOC-T1 + SOC-T2</p>
    </div>
  );
}

function InactiveUsersPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/security/inactive-users');
      setRows(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-8 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>;

  return (
    <div className="space-y-3" data-testid="inactive-panel">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertTriangle className="mr-1 inline h-3 w-3" />
        Users idle for 90 days are auto-disabled per our SOC-F1 security policy. Warning emails go out at 60, 75, and 89 days.
      </div>
      <div className="rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 text-left text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Last login</th>
              <th className="px-3 py-2">Idle</th>
              <th className="px-3 py-2">Expires in</th>
              <th className="px-3 py-2">MFA</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-zinc-50">
                <td className="px-3 py-2">
                  <div className="font-medium text-zinc-900">{r.full_name || '—'}</div>
                  <div className="text-[10px] text-zinc-500">{r.email}</div>
                </td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ROLE_COLORS[r.role] || 'bg-zinc-100'}`}>{r.role}</span></td>
                <td className="px-3 py-2 text-zinc-600">{r.last_login ? new Date(r.last_login).toLocaleDateString() : 'never'}</td>
                <td className="px-3 py-2">
                  <span className={`font-semibold ${r.days_idle >= 75 ? 'text-red-700' : r.days_idle >= 60 ? 'text-amber-700' : 'text-zinc-600'}`}>{r.days_idle} d</span>
                </td>
                <td className="px-3 py-2">
                  {r.is_active ? (
                    <span className={`font-semibold ${r.expires_in_days <= 7 ? 'text-red-700' : r.expires_in_days <= 30 ? 'text-amber-700' : 'text-zinc-600'}`}>{r.expires_in_days} d</span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">{r.mfa_enabled ? <ShieldCheck className="h-3.5 w-3.5 text-green-600" /> : <ShieldOff className="h-3.5 w-3.5 text-zinc-400" />}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.is_active ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-600'}`}>{r.is_active ? 'active' : 'disabled'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
