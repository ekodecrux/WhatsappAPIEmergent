import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Plus, Trash2, X, Copy, Mail, Users, ShieldCheck, Power } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const ROLES = ['admin', 'member', 'viewer'];

export default function Team() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', full_name: '', role: 'member' });
  const [generated, setGenerated] = useState(null);

  const load = async () => {
    const [m, i] = await Promise.all([api.get('/team/members'), api.get('/team/invites')]);
    setMembers(m.data); setInvites(i.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/team/invites', form);
      setGenerated(data);
      toast.success('Invite sent');
      setOpen(false);
      setForm({ email: '', full_name: '', role: 'member' });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  const updateMember = async (id, body) => { await api.patch(`/team/members/${id}`, body); load(); };
  const removeMember = async (id) => {
    if (!window.confirm('Remove this member?')) return;
    await api.delete(`/team/members/${id}`); load();
  };
  const revokeInvite = async (id) => { await api.delete(`/team/invites/${id}`); load(); };
  const copy = (t) => { navigator.clipboard.writeText(t); toast.success('Copied'); };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Team</h1>
          <p className="mt-1 text-sm text-zinc-600">Invite teammates &amp; manage roles.</p>
        </div>
        {isAdmin && (
          <button data-testid="invite-btn" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid">
            <Plus className="h-4 w-4" /> Invite teammate
          </button>
        )}
      </div>

      {generated && (
        <div className="rounded-md border border-green-300 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-wa-dark" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-wa-dark">Invite token (also emailed). Share with teammate.</div>
              <div className="mt-2 flex items-center gap-2 rounded-md border border-green-200 bg-white p-2.5 font-mono text-xs">
                <code className="flex-1 truncate" data-testid="invite-token">{generated.token}</code>
                <button onClick={() => copy(generated.token)} className="rounded p-1 hover:bg-zinc-100"><Copy className="h-3.5 w-3.5" /></button>
              </div>
              <button onClick={() => setGenerated(null)} className="mt-2 text-xs text-wa-dark underline">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Members */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-medium">Members ({members.length})</h2>
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr><th className="px-5 py-2.5 text-left font-semibold">Person</th><th className="px-5 py-2.5 text-left font-semibold">Role</th><th className="px-5 py-2.5 text-left font-semibold">Status</th><th className="px-5 py-2.5 text-left font-semibold">Joined</th><th className="px-5 py-2.5 text-right font-semibold">·</th></tr>
            </thead>
            <tbody>
              {members.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-zinc-500"><Users className="mx-auto mb-3 h-6 w-6 text-zinc-300" />No members yet.</td></tr>}
              {members.map(mb => (
                <tr key={mb.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-medium text-zinc-900">{mb.full_name}</div>
                    <div className="text-xs text-zinc-500">{mb.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    {isAdmin && mb.id !== user?.id ? (
                      <select value={mb.role} onChange={(e) => updateMember(mb.id, { role: e.target.value })} className="rounded-md border border-zinc-200 bg-transparent px-1.5 py-0.5 text-xs">
                        {ROLES.map(r => <option key={r}>{r}</option>)}
                      </select>
                    ) : (
                      <span className="capitalize">{mb.role}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${mb.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-600'}`}>
                      {mb.is_active !== false ? 'active' : 'disabled'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-zinc-500">{mb.created_at ? new Date(mb.created_at).toLocaleDateString() : '—'}</td>
                  <td className="px-5 py-3 text-right">
                    {isAdmin && mb.id !== user?.id && (
                      <div className="inline-flex items-center gap-1">
                        <button data-testid={`toggle-${mb.id}`} onClick={() => updateMember(mb.id, { is_active: mb.is_active === false })} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100" title={mb.is_active === false ? 'Enable' : 'Disable'}>
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button data-testid={`remove-${mb.id}`} onClick={() => removeMember(mb.id)} className="rounded-md p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pending invites */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-medium">Pending invites</h2>
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr><th className="px-5 py-2.5 text-left font-semibold">Email</th><th className="px-5 py-2.5 text-left font-semibold">Role</th><th className="px-5 py-2.5 text-left font-semibold">Status</th><th className="px-5 py-2.5 text-left font-semibold">Expires</th><th className="px-5 py-2.5 text-right font-semibold">·</th></tr>
            </thead>
            <tbody>
              {invites.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-zinc-500"><Mail className="mx-auto mb-3 h-6 w-6 text-zinc-300" />No invites yet.</td></tr>}
              {invites.map(iv => (
                <tr key={iv.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-5 py-3 font-medium">{iv.email}</td>
                  <td className="px-5 py-3 capitalize">{iv.role}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${iv.accepted_at ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                      {iv.accepted_at ? 'accepted' : 'pending'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-zinc-500">{new Date(iv.expires_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    {!iv.accepted_at && isAdmin && (
                      <button onClick={() => revokeInvite(iv.id)} className="rounded-md p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">Invite teammate</h3><button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button></div>
            <form onSubmit={submit} className="space-y-3">
              <input data-testid="invite-email" required type="email" placeholder="teammate@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input placeholder="Full name (optional)" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <select data-testid="invite-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
                <button data-testid="invite-submit" className="rounded-md bg-wa-dark px-3 py-2 text-sm text-white">Send invite</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
