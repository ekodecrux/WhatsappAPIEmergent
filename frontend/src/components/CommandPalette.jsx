import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Send, Users, MessagesSquare, Bot, FileText, Workflow,
  BarChart3, CreditCard, Plug, UserPlus, Settings as SettingsIcon, Wallet,
  MessageSquare, Activity, Store, LifeBuoy, Search, Sparkles, Plus,
} from 'lucide-react';

const ENTRIES = [
  // Quick actions (always on top)
  { id: 'a-campaign', kind: 'action', label: 'New campaign', icon: Plus, to: '/app/campaigns', hint: 'Engage' },
  { id: 'a-flow', kind: 'action', label: 'New chatbot flow', icon: Workflow, to: '/app/flows', hint: 'Engage' },
  { id: 'a-topup', kind: 'action', label: 'Top up wallet', icon: Wallet, to: '/app/wallet', hint: 'Account' },
  { id: 'a-key', kind: 'action', label: 'Generate API key', icon: Plug, to: '/app/integrations', hint: 'Build' },

  // Navigation
  { id: 'n-dashboard', kind: 'page', label: 'Dashboard', icon: LayoutDashboard, to: '/app' },
  { id: 'n-campaigns', kind: 'page', label: 'Campaigns', icon: Send, to: '/app/campaigns' },
  { id: 'n-flows', kind: 'page', label: 'Chatbots / Flows', icon: Workflow, to: '/app/flows' },
  { id: 'n-templates', kind: 'page', label: 'Templates', icon: FileText, to: '/app/templates' },
  { id: 'n-marketplace', kind: 'page', label: 'Marketplace', icon: Store, to: '/app/marketplace' },
  { id: 'n-inbox', kind: 'page', label: 'Inbox / Live Chat', icon: MessagesSquare, to: '/app/chat' },
  { id: 'n-leads', kind: 'page', label: 'Leads & CRM', icon: Users, to: '/app/leads' },
  { id: 'n-auto', kind: 'page', label: 'Auto-replies', icon: Bot, to: '/app/auto-replies' },
  { id: 'n-analytics', kind: 'page', label: 'Analytics', icon: BarChart3, to: '/app/analytics' },
  { id: 'n-delivery', kind: 'page', label: 'Delivery status', icon: Activity, to: '/app/delivery' },
  { id: 'n-channels', kind: 'page', label: 'Channels / WhatsApp setup', icon: MessageSquare, to: '/app/whatsapp' },
  { id: 'n-developer', kind: 'page', label: 'Developer / ERP & API', icon: Plug, to: '/app/integrations' },
  { id: 'n-team', kind: 'page', label: 'Team', icon: UserPlus, to: '/app/team' },
  { id: 'n-wallet', kind: 'page', label: 'Wallet', icon: Wallet, to: '/app/wallet' },
  { id: 'n-billing', kind: 'page', label: 'Subscription / Billing', icon: CreditCard, to: '/app/billing' },
  { id: 'n-support', kind: 'page', label: 'Support', icon: LifeBuoy, to: '/app/support' },
  { id: 'n-settings', kind: 'page', label: 'Settings', icon: SettingsIcon, to: '/app/settings' },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ(''); setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!q.trim()) return ENTRIES;
    const s = q.toLowerCase();
    return ENTRIES.filter(e =>
      e.label.toLowerCase().includes(s) ||
      (e.hint || '').toLowerCase().includes(s) ||
      e.kind.includes(s)
    );
  }, [q]);

  useEffect(() => { setActive(0); }, [q]);

  const choose = (e) => {
    setOpen(false);
    navigate(e.to);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => Math.min(filtered.length - 1, i + 1));
      listRef.current?.children[Math.min(filtered.length - 1, active + 1)]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(0, i - 1));
      listRef.current?.children[Math.max(0, active - 1)]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && filtered[active]) {
      e.preventDefault();
      choose(filtered[active]);
    }
  };

  if (!open) return null;
  return (
    <div data-testid="command-palette" className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-md border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            ref={inputRef}
            data-testid="palette-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search features, jump to a page, or run an action…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-zinc-500">
              <Sparkles className="mx-auto mb-2 h-4 w-4 text-zinc-300" />
              No matches. Try “campaign”, “wallet”, or “API”.
            </div>
          )}
          {filtered.map((e, i) => {
            const Icon = e.icon;
            const isActive = i === active;
            return (
              <button
                key={e.id}
                data-testid={`palette-item-${e.id}`}
                onClick={() => choose(e)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition ${isActive ? 'bg-wa-dark/5 text-wa-dark' : 'text-zinc-800 hover:bg-zinc-50'}`}
              >
                <span className={`grid h-7 w-7 place-items-center rounded-md border ${e.kind === 'action' ? 'border-green-300 bg-green-50 text-green-700' : 'border-zinc-200 bg-white text-zinc-700'}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1">{e.label}</span>
                {e.kind === 'action' && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-800">Action</span>}
                {isActive && <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">↵</kbd>}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-[10px] text-zinc-500">
          <span className="inline-flex items-center gap-2">
            <kbd className="rounded border border-zinc-300 bg-white px-1 font-mono text-[9px]">↑</kbd>
            <kbd className="rounded border border-zinc-300 bg-white px-1 font-mono text-[9px]">↓</kbd>
            navigate
          </span>
          <span className="inline-flex items-center gap-2">
            <kbd className="rounded border border-zinc-300 bg-white px-1 font-mono text-[9px]">↵</kbd>
            select
          </span>
          <span className="inline-flex items-center gap-2">
            <kbd className="rounded border border-zinc-300 bg-white px-1 font-mono text-[9px]">⌘K</kbd>
            toggle
          </span>
        </div>
      </div>
    </div>
  );
}
