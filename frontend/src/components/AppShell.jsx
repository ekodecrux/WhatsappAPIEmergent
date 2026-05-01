import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Send, Users, MessagesSquare, Bot,
  FileText, Workflow, BarChart3, CreditCard, Plug, UserPlus, BookOpen, Settings as SettingsIcon, LogOut,
  Menu, X, ChevronRight, AlertTriangle, Sparkles, Store, Activity, Shield, LifeBuoy, Wallet, Banknote,
  Search, Package,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AIAssistant from './AIAssistant';
import CommandPalette from './CommandPalette';
import api from '../lib/api';

const TENANT_NAV = [
  // Engage
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true, group: 'engage' },
  { to: '/app/campaigns', label: 'Campaigns', icon: Send, group: 'engage' },
  { to: '/app/flows', label: 'Chatbots', icon: Workflow, group: 'engage' },
  { to: '/app/templates', label: 'Templates', icon: FileText, group: 'engage' },
  { to: '/app/catalog', label: 'Catalog', icon: Package, group: 'engage' },
  { to: '/app/marketplace', label: 'Marketplace', icon: Store, group: 'engage' },
  // Customers
  { to: '/app/chat', label: 'Inbox', icon: MessagesSquare, group: 'customers' },
  { to: '/app/leads', label: 'Leads & CRM', icon: Users, group: 'customers' },
  { to: '/app/auto-replies', label: 'Auto-replies', icon: Bot, group: 'customers' },
  // Insights
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3, group: 'insights' },
  { to: '/app/delivery', label: 'Delivery', icon: Activity, group: 'insights' },
  // Build
  { to: '/app/whatsapp', label: 'Channels', icon: MessageSquare, group: 'build' },
  { to: '/app/integrations', label: 'Developer', icon: Plug, group: 'build' },
  { to: '/app/team', label: 'Team', icon: UserPlus, group: 'build' },
  // Account
  { to: '/app/wallet', label: 'Wallet', icon: Wallet, group: 'account' },
  { to: '/app/billing', label: 'Subscription', icon: CreditCard, group: 'account' },
  { to: '/app/support', label: 'Support', icon: LifeBuoy, group: 'account' },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon, group: 'account' },
];

const NAV_GROUPS = [
  { id: 'engage', label: 'Engage' },
  { id: 'customers', label: 'Customers' },
  { id: 'insights', label: 'Insights' },
  { id: 'build', label: 'Build' },
  { id: 'account', label: 'Account' },
];

const SUPERADMIN_NAV = [
  { to: '/app/admin', label: 'Platform Console', icon: Shield, end: true },
  { to: '/app/admin?tab=tenants', label: 'Tenants', icon: Users },
  { to: '/app/admin?tab=subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/app/admin?tab=pricing', label: 'Pricing & Discounts', icon: Banknote },
  { to: '/app/admin?tab=tickets', label: 'Support Inbox', icon: LifeBuoy },
  { to: '/app/admin?tab=analytics', label: 'Analytics', icon: BarChart3 },
];

const TITLES = TENANT_NAV.reduce((m, n) => ({ ...m, [n.to]: n.label }), {});

export default function AppShell() {
  const { user, logout, stopImpersonation } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wallet, setWallet] = useState(null);
  const isSuper = !!user?.is_superadmin;
  const isImpersonating = !!user?.impersonating;
  const NAV = isSuper ? SUPERADMIN_NAV : TENANT_NAV;

  useEffect(() => {
    if (isSuper) return; // no wallet for platform owner
    const refresh = () => {
      api.get('/wallet').then(({ data }) => setWallet(data)).catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [location.pathname, isSuper]);

  // Hard-redirect superadmin away from tenant routes — they have no tenant data
  const TENANT_ONLY_PATHS = ['/app/whatsapp', '/app/campaigns', '/app/leads', '/app/chat', '/app/auto-replies',
    '/app/flows', '/app/marketplace', '/app/templates', '/app/analytics', '/app/delivery', '/app/wallet',
    '/app/billing', '/app/integrations', '/app/team', '/app/support', '/app/guide'];
  const onTenantOnlyPath = TENANT_ONLY_PATHS.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));
  if (isSuper && (location.pathname === '/app' || onTenantOnlyPath)) {
    return <Navigate to="/app/admin" replace />;
  }

  const planSlug = user?.plan || 'free';
  const onFree = !isSuper && (planSlug === 'free' || planSlug === 'trial');
  const initials = (user?.full_name || 'U').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  const onLogout = () => { logout(); navigate('/login'); };

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col border-r border-zinc-200 bg-white">
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
        <NavLink to={isSuper ? '/app/admin' : '/app'} className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className={`grid h-7 w-7 place-items-center rounded-md text-white ${isSuper ? 'bg-purple-700' : 'bg-wa-dark'}`}>
            {isSuper ? <Shield className="h-3.5 w-3.5" strokeWidth={2.5} /> : <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.5} />}
          </span>
          <span className="font-display">{isSuper ? 'wabridge platform' : 'wabridge'}</span>
        </NavLink>
        <button data-testid="close-sidebar" className="text-zinc-500 lg:hidden" onClick={() => setMobileOpen(false)}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        {isSuper && (
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-purple-700">Platform Owner</div>
        )}
        <nav className="space-y-0.5 px-2">
          {isSuper ? (
            NAV.map((item) => {
              const isQueryRoute = item.to.includes('?');
              const targetPath = isQueryRoute ? item.to.split('?')[0] : item.to;
              const targetTab = isQueryRoute ? new URLSearchParams(item.to.split('?')[1]).get('tab') : null;
              const currentTab = new URLSearchParams(location.search).get('tab');
              const isActive = isQueryRoute
                ? location.pathname === targetPath && currentTab === targetTab
                : (item.end ? location.pathname === item.to && !location.search : location.pathname.startsWith(item.to));
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  data-testid={`nav-${item.label.replace(/\s|\/|&/g, '-').toLowerCase()}`}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition ${
                    isActive
                      ? 'bg-purple-50 font-medium text-purple-900'
                      : 'text-purple-800 hover:bg-purple-50'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })
          ) : (
            NAV_GROUPS.map((g) => {
              const items = NAV.filter(n => n.group === g.id);
              if (!items.length) return null;
              return (
                <div key={g.id} className="pb-1">
                  <div className="px-2.5 pb-1 pt-3 text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-400 first:pt-0">{g.label}</div>
                  {items.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      data-testid={`nav-${item.label.replace(/\s|\/|&/g, '-').toLowerCase()}`}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition ${
                          isActive ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              );
            })
          )}
        </nav>
        {onFree && (
          <div className="mx-3 mt-6 rounded-md border border-zinc-200 bg-gradient-to-br from-wa-dark to-wa-mid p-3.5 text-white">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-wa-light">
              <Sparkles className="h-3 w-3" /> Free plan
            </div>
            <div className="mt-1 font-display text-xl font-semibold leading-tight">100 messages / mo</div>
            <p className="mt-1 text-xs text-white/70">Upgrade to Starter (₹499) or Pro (₹999).</p>
            <button
              data-testid="upgrade-from-sidebar"
              onClick={() => navigate('/app/billing')}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-wa-light px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
            >
              Upgrade <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      <div className="border-t border-zinc-200 p-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-green-100 text-xs font-semibold text-green-800">{initials}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-900">{user?.full_name}</div>
            <div className="truncate text-xs text-zinc-500">{user?.email}</div>
          </div>
          <button
            data-testid="logout-button"
            onClick={onLogout}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  const currentTitle = (() => {
    const path = location.pathname.replace(/\/$/, '');
    if (isSuper) {
      const tab = new URLSearchParams(location.search).get('tab');
      const map = { tenants: 'Tenants', subscriptions: 'Subscriptions', pricing: 'Pricing & Discounts', tickets: 'Support Inbox', analytics: 'Analytics', users: 'Users', overview: 'Overview' };
      return map[tab] || 'Platform Console';
    }
    if (TITLES[path]) return TITLES[path];
    if (path === '/app') return 'Overview';
    return TENANT_NAV.find(n => path.startsWith(n.to) && n.to !== '/app')?.label || '';
  })();

  return (
    <div className="flex h-screen flex-col bg-zinc-50">
      {isImpersonating && (
        <div data-testid="impersonation-banner" className="flex h-9 items-center justify-between bg-amber-500 px-4 text-xs font-medium text-amber-950">
          <span className="inline-flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" />
            Viewing as <strong className="font-bold">{user?.email}</strong> at <strong className="font-bold">{user?.company_name}</strong> · impersonated by {user?.impersonated_by}
          </span>
          <button
            data-testid="stop-impersonation"
            onClick={() => { stopImpersonation(); navigate('/app/admin?tab=tenants'); }}
            className="rounded bg-amber-950 px-2.5 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-800"
          >Return to platform</button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">{Sidebar}</div>

        {/* Mobile sidebar drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0">{Sidebar}</div>
          </div>
        )}

        {/* Main */}
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/70 px-4 backdrop-blur-xl sm:px-6">
            <div className="flex items-center gap-3">
              <button
                data-testid="open-sidebar"
                className="rounded-md p-1.5 text-zinc-700 hover:bg-zinc-100 lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500">{isSuper ? 'wabridge platform' : user?.company_name}</span>
                <span className="text-zinc-300">/</span>
                <span className="font-medium text-zinc-900">{currentTitle}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                data-testid="open-palette"
                onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                className="hidden items-center gap-2 rounded-md border border-zinc-200 bg-white/70 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 sm:inline-flex"
                title="Quick jump (⌘K / Ctrl K)"
              >
                <Search className="h-3 w-3" />
                Jump to…
                <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1 font-mono text-[9px]">⌘K</kbd>
              </button>
              {!isSuper && wallet?.billing_mode === 'wallet' && (
                <button
                  data-testid="topbar-wallet-pill"
                  onClick={() => navigate('/app/wallet')}
                  title={`Wallet balance · ${wallet.estimated_marketing_messages_left} marketing msgs left`}
                  className={`hidden items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${
                    wallet.wallet_balance_inr < (wallet.low_balance_threshold_inr || 50)
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
                  }`}
                >
                  <Wallet className="h-3.5 w-3.5" />
                  <span className="font-mono">₹{(wallet.wallet_balance_inr || 0).toFixed(2)}</span>
                </button>
              )}
              {!isSuper && onFree && (
                <div className="hidden items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 sm:flex">
                  <AlertTriangle className="h-3.5 w-3.5" /> Free plan — upgrade for more
                </div>
              )}
              {isSuper ? (
                <span className="hidden rounded-md border border-purple-300 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-purple-800 sm:inline-flex">
                  Platform Owner
                </span>
              ) : (
                <span className="hidden rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 sm:inline-flex">
                  {planSlug}
                </span>
              )}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
      {!isSuper && <AIAssistant />}
      {!isSuper && <CommandPalette />}
    </div>
  );
}
