import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Building2, User, Mail, Shield } from 'lucide-react';

const Row = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 border-b border-zinc-200 py-4 last:border-0">
    <Icon className="h-4 w-4 text-zinc-500" />
    <div className="flex-1">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm text-zinc-900">{value}</div>
    </div>
  </div>
);

export default function Settings() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">Account &amp; workspace details.</p>
      </div>
      <div className="rounded-md border border-zinc-200 bg-white px-5">
        <Row icon={User} label="Full name" value={user?.full_name} />
        <Row icon={Mail} label="Email" value={user?.email} />
        <Row icon={Building2} label="Company" value={user?.company_name} />
        <Row icon={Shield} label="Role" value={user?.role} />
      </div>
      <div className="rounded-md border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
        Profile editing &amp; team-management coming soon.
      </div>
    </div>
  );
}
