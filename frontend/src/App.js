import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BrandingProvider } from './contexts/BrandingContext';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import AcceptInvite from './pages/AcceptInvite';
import AppShell from './components/AppShell';
import Dashboard from './pages/Dashboard';
import WhatsAppSetup from './pages/WhatsAppSetup';
import Campaigns from './pages/Campaigns';
import Leads from './pages/Leads';
import Chat from './pages/Chat';
import AutoReplies from './pages/AutoReplies';
import Templates from './pages/Templates';
import Flows from './pages/Flows';
import FlowBuilder from './pages/FlowBuilder';
import Marketplace from './pages/Marketplace';
import Catalog from './pages/Catalog';
import Delivery from './pages/Delivery';
import AdminConsole from './pages/AdminConsole';
import Support from './pages/Support';
import WalletPage from './pages/WalletPage';
import Analytics from './pages/Analytics';
import Billing from './pages/Billing';
import Integrations from './pages/Integrations';
import Settings from './pages/Settings';
import ConnectWhatsApp from './pages/ConnectWhatsApp';
import Branding from './pages/Branding';
import Security from './pages/Security';
import Team from './pages/Team';
import UserGuide from './pages/UserGuide';

function Private({ children }) {
  const { user } = useAuth();
  if (!user?.access_token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrandingProvider>
        <Toaster position="top-right" richColors />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />

            <Route path="/app" element={<Private><AppShell /></Private>}>
              <Route index element={<Dashboard />} />
              <Route path="whatsapp" element={<WhatsAppSetup />} />
            <Route path="connect-whatsapp" element={<ConnectWhatsApp />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="leads" element={<Leads />} />
              <Route path="chat" element={<Chat />} />
              <Route path="auto-replies" element={<AutoReplies />} />
              <Route path="templates" element={<Templates />} />
              <Route path="flows" element={<Flows />} />
              <Route path="flows/:id" element={<FlowBuilder />} />
              <Route path="marketplace" element={<Marketplace />} />
              <Route path="catalog" element={<Catalog />} />
              <Route path="delivery" element={<Delivery />} />
              <Route path="support" element={<Support />} />
              <Route path="wallet" element={<WalletPage />} />
              <Route path="admin" element={<AdminConsole />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="billing" element={<Billing />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="team" element={<Team />} />
              <Route path="guide" element={<UserGuide />} />
              <Route path="branding" element={<Branding />} />
              <Route path="security" element={<Security />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </BrandingProvider>
    </AuthProvider>
  );
}
