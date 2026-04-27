import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wa_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/')) {
      localStorage.removeItem('wa_token');
      localStorage.removeItem('wa_user');
      if (window.location.pathname.startsWith('/app')) window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
