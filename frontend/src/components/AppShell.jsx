import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Send, Users, MessagesSquare, Bot,
  FileText, Workflow, BarChart3, CreditCard, Plug, UserPlus, BookOpen, Settings as SettingsIcon, LogOut,
  Menu, X, ChevronRight, AlertTriangle, Sparkles, Store, Activity, Shield, LifeBuoy, Wallet
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AIAssistant from './AIAssistant';
import api from '../lib/api';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/whatsapp', label: 'WhatsApp Setup', icon: MessageSquare },
  { to: '/app/campaigns', label: 'Campaigns', icon: Send },
  { to: '/app/leads', label: 'Leads / CRM', icon: Users },
  { to: '/app/chat', label: 'Live Chat', icon: MessagesSquare },
  { to: '/app/auto-replies', label: 'Auto-replies', icon: Bot },
  { to: '/app/flows', label: 'Chatbot Flows', icon: Workflow },
  { to: '/app/marketplace', label: 'Marketplace', icon: Store },
  { to: '/app/templates', label: 'Templates', icon: FileText },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/delivery', label: 'Delivery Status', icon: Activity },
  { to: '/app/wallet', label: 'Wallet', icon: Wallet },
  { to: '/app/billing', label: 'Subscription', icon: CreditCard },
  { to: '/app/integrations', label: 'ERP & API', icon: Plug },
  { to: '/app/team', label: 'Team', icon: UserPlus },
  { to: '/app/support', label: 'Support', icon: LifeBuoy },
  { to: '/app/guide', label: 'User Guide', icon: BookOpen },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon },
];

const SUPERADMIN_NAV = [
  { to: '/app/admin', label: 'Admin Console', icon: Shield },
];

const TITLES = NAV.reduce((m, n) => ({ ...m, [n.to]: n.label }), {});

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const trial = user?.trial_days_left ?? 0;
  const onTrial = (user?.plan || 'trial') === 'trial';
  const initials = (user?.full_name || 'U').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  const [wallet, setWallet] = useState(null);
  useEffect(() => {
    let timer;
    const refresh = () => {
      api.get('/wallet').then(({ data }) => setWallet(data)).catch(() => {});
    };
    refresh();
    timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [location.pathname]);

  const onLogout = () => { logout(); navigate('/login'); };

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col border-r border-zinc-200 bg-white">
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
        <NavLink to="/app" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-wa-dark text-white">
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <span className="font-display">wabridge</span>
        </NavLink>
        <button data-testid="close-sidebar" className="text-zinc-500 lg:hidden" onClick={() => setMobileOpen(false)}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        <nav className="space-y-0.5 px-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={`nav-${item.label.replace(/\s|\//g, '-').toLowerCase()}`}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition ${
                  isActive ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
          {user?.is_superadmin && (
            <>
              <div className="mt-4 border-t border-zinc-200 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-purple-700">
                Platform
              </div>
              {SUPERADMIN_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  data-testid={`nav-${item.label.replace(/\s|\//g, '-').toLowerCase()}`}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition ${
                      isActive ? 'bg-purple-50 font-medium text-purple-900' : 'text-purple-700 hover:bg-purple-50'
                    }`
                  }
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>
        {onTrial && (
          <div className="mx-3 mt-6 rounded-md border border-zinc-200 bg-gradient-to-br from-wa-dark to-wa-mid p-3.5 text-white">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-wa-light">
              <Sparkles className="h-3 w-3" /> Trial
            </div>
            <div className="mt-1 font-display text-xl font-semibold leading-tight">{trial} days left</div>
            <p className="mt-1 text-xs text-white/70">Unlock Pro for unlimited workflows.</p>
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
    if (TITLES[path]) return TITLES[path];
    if (path === '/app') return 'Overview';
    return NAV.find(n => path.startsWith(n.to) && n.to !== '/app')?.label || '';
  })();

  return (
    <div className="flex h-screen bg-zinc-50">
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
              <span className="text-zinc-500">{user?.company_name}</span>
              <span className="text-zinc-300">/</span>
              <span className="font-medium text-zinc-900">{currentTitle}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {wallet?.billing_mode === 'wallet' && (
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
            {onTrial && trial <= 5 && (
              <div className="hidden items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 sm:flex">
                <AlertTriangle className="h-3.5 w-3.5" /> {trial} days left in trial
              </div>
            )}
            <span className="hidden rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 sm:inline-flex">
              {user?.plan || 'trial'}
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
      <AIAssistant />
    </div>
  );
}
