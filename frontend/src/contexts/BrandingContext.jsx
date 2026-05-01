import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../lib/api';

const BrandingContext = createContext({ branding: null, loading: true });

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const host = window.location.hostname;
    // Skip on localhost / preview agents host — only look up if user is on a custom domain
    const isOurHost = /(^localhost$)|(emergentagent\.com$)|(^127\.0\.0\.1$)|(\.local$)/i.test(host);
    if (isOurHost) { setLoading(false); return; }
    api.get(`/branding/public?host=${encodeURIComponent(host)}`)
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.matched && data?.branding) {
          setBranding(data.branding);
          applyBrandingDOM(data.branding);
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, loading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() { return useContext(BrandingContext); }

function applyBrandingDOM(b) {
  if (!b) return;
  if (b.brand_name) document.title = b.brand_name;
  if (b.favicon_url) {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = b.favicon_url;
  }
  if (b.primary_color) {
    document.documentElement.style.setProperty('--brand-primary', b.primary_color);
  }
  if (b.custom_css) {
    let style = document.getElementById('tenant-custom-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tenant-custom-css';
      document.head.appendChild(style);
    }
    style.textContent = b.custom_css;
  }
}
