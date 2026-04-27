import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';

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
import Analytics from './pages/Analytics';
import Billing from './pages/Billing';
import Integrations from './pages/Integrations';
import Settings from './pages/Settings';
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
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="leads" element={<Leads />} />
            <Route path="chat" element={<Chat />} />
            <Route path="auto-replies" element={<AutoReplies />} />
            <Route path="templates" element={<Templates />} />
            <Route path="flows" element={<Flows />} />
            <Route path="flows/:id" element={<FlowBuilder />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="billing" element={<Billing />} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="team" element={<Team />} />
            <Route path="guide" element={<UserGuide />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
