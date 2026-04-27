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
    }
    setUser(u);
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
      const merged = { ...user, ...data.user, plan: data.tenant?.plan, company_name: data.tenant?.company_name, trial_days_left: data.trial_days_left };
      localStorage.setItem('wa_user', JSON.stringify(merged));
      setUser(merged);
    } catch {}
  };

  useEffect(() => {
    if (user?.access_token) refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
