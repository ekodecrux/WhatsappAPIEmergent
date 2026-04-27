import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Search, Download, Store, TrendingUp, Clock, Tag, User, Workflow, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

export default function Marketplace() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [creds, setCreds] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('recent');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = { sort };
      if (search) params.search = search;
      if (category !== 'all') params.category = category;
      const [{ data: list }, { data: cats }, { data: c }] = await Promise.all([
        api.get('/marketplace/templates', { params }),
        api.get('/marketplace/categories'),
        api.get('/whatsapp/credentials'),
      ]);
      setItems(list);
      setCategories(cats);
      setCreds(c);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sort, category]);

  const onSearch = (e) => { e.preventDefault(); load(); };

  const clone = async (tpl) => {
    if (!creds[0]) { toast.error('Connect a WhatsApp credential first'); return; }
    try {
      const { data } = await api.post(`/marketplace/templates/${tpl.id}/clone`, { credential_id: creds[0].id });
      toast.success(`Imported "${tpl.name}" — opening builder`);
      navigate(`/app/flows/${data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Clone failed');
    }
  };

  const remove = async (tpl) => {
    if (!window.confirm(`Unpublish "${tpl.name}" from marketplace?`)) return;
    try {
      await api.delete(`/marketplace/templates/${tpl.id}`);
      toast.success('Unpublished');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Store className="h-6 w-6 text-wa-dark" /> Template Marketplace
          </h1>
          <p className="mt-1 text-sm text-zinc-600">Browse community-built chatbot flows and clone them in one click.</p>
        </div>
        <button
          data-testid="back-to-flows"
          onClick={() => navigate('/app/flows')}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
        >
          <Workflow className="h-3.5 w-3.5" /> Back to my flows
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <form onSubmit={onSearch} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            data-testid="market-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates by name, description or tag…"
            className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
          />
        </form>
        <select
          data-testid="market-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          data-testid="market-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          <option value="recent">Most recent</option>
          <option value="popular">Most popular</option>
        </select>
      </div>

      {loading && <div className="rounded-md border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">Loading templates…</div>}

      {!loading && items.length === 0 && (
        <div className="rounded-md border border-dashed border-zinc-300 bg-white p-12 text-center">
          <Store className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
          <div className="font-display text-lg font-medium">Marketplace is empty</div>
          <p className="mt-1 text-sm text-zinc-500">Be the first to publish — any flow can be shared from the Flows page.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(t => {
          const isMine = t.author_company === user?.company_name;
          return (
            <div key={t.id} data-testid={`market-tpl-${t.id}`} className="flex flex-col rounded-md border border-zinc-200 bg-white p-5 transition hover:border-wa-light hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-wa-dark/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-wa-dark">{t.category}</span>
                <div className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                  <TrendingUp className="h-3 w-3" /> {t.downloads || 0} clones
                </div>
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-zinc-900">{t.name}</h3>
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-600">{t.description}</p>
              {t.tags?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.tags.slice(0, 4).map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600">
                      <Tag className="h-2.5 w-2.5" /> {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3 text-[11px] text-zinc-500">
                <User className="h-3 w-3" />
                <span className="truncate">{t.author_company || t.author_name || 'Anonymous'}</span>
                <span className="ml-auto inline-flex items-center gap-1"><Clock className="h-3 w-3" />{(t.created_at || '').slice(0, 10)}</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                {isMine && (
                  <button
                    data-testid={`market-delete-${t.id}`}
                    onClick={() => remove(t)}
                    title="Unpublish"
                    className="rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  data-testid={`market-clone-${t.id}`}
                  onClick={() => clone(t)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-mid"
                >
                  <Download className="h-3.5 w-3.5" /> Clone to my flows
                </button>
              </div>
              <div className="mt-2 text-[10px] text-zinc-400">
                {t.node_count} nodes · default lang: <span className="uppercase">{t.language || 'en'}</span>
                {Object.keys(t.translations || {}).length > 0 && <> · +{Object.keys(t.translations).length} translation(s)</>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
