import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('wa_user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const persist = (u) => {
    if (u) {
      localStorage.setItem('wa_user', JSON.stringify(u));
      localStorage.setItem('wa_token', u.access_token);
    } else {
      localStorage.removeItem('wa_user');
      localStorage.removeItem('wa_token');
      localStorage.removeItem('wa_super_user');
    }
    setUser(u);
  };

  const setSession = (data) => persist(data);

  // ===== Impersonation =====
  const startImpersonation = (sessionData) => {
    // Save current super-admin session under separate key so we can restore later
    if (user) localStorage.setItem('wa_super_user', JSON.stringify(user));
    persist({ ...sessionData, impersonating: true });
  };
  const stopImpersonation = () => {
    try {
      const raw = localStorage.getItem('wa_super_user');
      if (raw) {
        const restored = JSON.parse(raw);
        localStorage.removeItem('wa_super_user');
        persist(restored);
        return true;
      }
    } catch {}
    persist(null);
    return false;
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      persist(data);
      return data;
    } finally { setLoading(false); }
  };

  const register = async (payload) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', payload);
      persist(data);
      return data;
    } finally { setLoading(false); }
  };

  const logout = () => persist(null);

  const refreshUser = async () => {
    try {
      const { data } = await api.get('/auth/me');
      const merged = { ...user, ...data.user, plan: data.tenant?.plan, company_name: data.tenant?.company_name, trial_days_left: data.trial_days_left, is_superadmin: data.user?.is_superadmin || user?.is_superadmin };
      localStorage.setItem('wa_user', JSON.stringify(merged));
      setUser(merged);
    } catch {}
  };

  useEffect(() => {
    if (user?.access_token) refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshUser, setSession, startImpersonation, stopImpersonation, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
