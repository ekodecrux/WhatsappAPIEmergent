import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Search, Download, Store, TrendingUp, Clock, Tag, User, Workflow, Trash2, Star, X, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

function StarRow({ value = 0, onChange, size = 'sm' }) {
  const cls = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={onChange ? () => onChange(n) : undefined}
          className={`${onChange ? 'cursor-pointer' : 'cursor-default'} text-amber-500 disabled:cursor-default`}
        >
          <Star className={`${cls} ${n <= value ? 'fill-amber-500' : 'fill-transparent'}`} />
        </button>
      ))}
    </div>
  );
}

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
  const [reviewModal, setReviewModal] = useState(null);  // {tpl, list, avg, count, myRating, myComment}
  const [submittingReview, setSubmittingReview] = useState(false);

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

  const openReviews = async (tpl) => {
    try {
      const { data } = await api.get(`/marketplace/templates/${tpl.id}/reviews`);
      const mine = (data.reviews || []).find(r => r.user_id === user?.id);
      setReviewModal({
        tpl,
        list: data.reviews || [],
        avg: data.avg_rating || 0,
        count: data.rating_count || 0,
        myRating: mine?.rating || 0,
        myComment: mine?.comment || '',
      });
    } catch (e) { toast.error('Failed to load reviews'); }
  };

  const submitReview = async () => {
    if (!reviewModal) return;
    if (!reviewModal.myRating) { toast.error('Pick a rating'); return; }
    setSubmittingReview(true);
    try {
      const { data } = await api.post(`/marketplace/templates/${reviewModal.tpl.id}/reviews`, {
        rating: reviewModal.myRating,
        comment: reviewModal.myComment,
      });
      toast.success('Thanks for your review!');
      const refreshed = await api.get(`/marketplace/templates/${reviewModal.tpl.id}/reviews`);
      setReviewModal({
        ...reviewModal,
        list: refreshed.data.reviews,
        avg: data.avg_rating,
        count: data.rating_count,
      });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
    } finally { setSubmittingReview(false); }
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
                <div className="inline-flex items-center gap-2 text-[11px] text-zinc-500">
                  {(t.rating_count || 0) > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      <span className="font-semibold text-amber-700">{(t.avg_rating || 0).toFixed(1)}</span>
                      <span>({t.rating_count})</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3" /> {t.downloads || 0}</span>
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
                  data-testid={`market-reviews-${t.id}`}
                  onClick={() => openReviews(t)}
                  title="Reviews"
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50"
                >
                  <Star className="h-3 w-3" /> Reviews
                </button>
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

      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-md border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold inline-flex items-center gap-2">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" /> Reviews · {reviewModal.tpl.name}
                </h3>
                <div className="mt-1 inline-flex items-center gap-2 text-xs text-zinc-600">
                  <StarRow value={Math.round(reviewModal.avg)} />
                  <span className="font-mono"><strong>{(reviewModal.avg || 0).toFixed(1)}</strong> · {reviewModal.count} review{reviewModal.count === 1 ? '' : 's'}</span>
                </div>
              </div>
              <button onClick={() => setReviewModal(null)}><X className="h-4 w-4" /></button>
            </div>

            {reviewModal.tpl.author_company !== user?.company_name && (
              <div className="rounded-md border border-zinc-200 bg-zinc-50/60 p-3" data-testid="my-review-form">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Your review</div>
                <div className="mt-1 inline-flex items-center gap-2">
                  <StarRow value={reviewModal.myRating} onChange={(n) => setReviewModal({ ...reviewModal, myRating: n })} size="lg" />
                  <span className="text-xs text-zinc-500">{reviewModal.myRating || '— pick a rating'}</span>
                </div>
                <textarea
                  data-testid="review-comment"
                  rows={2}
                  value={reviewModal.myComment || ''}
                  onChange={(e) => setReviewModal({ ...reviewModal, myComment: e.target.value })}
                  placeholder="What did you like? What could be better? (optional)"
                  className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
                <div className="mt-2 flex justify-end">
                  <button data-testid="review-submit" onClick={submitReview} disabled={submittingReview || !reviewModal.myRating} className="inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-mid disabled:opacity-50">
                    <MessageSquare className="h-3 w-3" /> {submittingReview ? 'Saving…' : 'Submit review'}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2.5" data-testid="review-list">
              {reviewModal.list.length === 0 && <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">No reviews yet — be the first.</div>}
              {reviewModal.list.map((r, i) => (
                <div key={i} className="rounded-md border border-zinc-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-2">
                      <StarRow value={r.rating} />
                      <span className="text-xs font-semibold">{r.user_name}</span>
                      {r.company && <span className="text-[10px] text-zinc-500">· {r.company}</span>}
                    </div>
                    <span className="text-[10px] text-zinc-500">{(r.created_at || '').slice(0, 10)}</span>
                  </div>
                  {r.comment && <div className="mt-1 whitespace-pre-wrap text-xs text-zinc-700">{r.comment}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
