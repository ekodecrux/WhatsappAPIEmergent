import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Trash2, Power, Play, Edit, Sparkles, Workflow, Banknote, GraduationCap, Target, LifeBuoy, FileText, QrCode, BarChart3, X, Download, Copy, Wand2, Languages, Store, Upload, Check } from 'lucide-react';
import { toast } from 'sonner';

const TPL_ICONS = {
  blank: FileText,
  banking: Banknote,
  training: GraduationCap,
  lead_qualifier: Target,
  support_faq: LifeBuoy,
};

const STATUS_BADGE = {
  active: 'bg-green-100 text-green-800',
  draft: 'bg-zinc-100 text-zinc-700',
};

export default function Flows() {
  const navigate = useNavigate();
  const [flows, setFlows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [creds, setCreds] = useState([]);
  const [qr, setQr] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiDesc, setAiDesc] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [langModal, setLangModal] = useState(null); // {flow, available, supported}
  const [pubModal, setPubModal] = useState(null);   // {flow, name, description, category, tags}
  const [langBusy, setLangBusy] = useState(false);
  const [pubBusy, setPubBusy] = useState(false);
  const [supportedLangs, setSupportedLangs] = useState([]);

  const load = async () => {
    const [f, t, c, sl] = await Promise.all([
      api.get('/flows'),
      api.get('/flows/templates'),
      api.get('/whatsapp/credentials'),
      api.get('/flows/_languages'),
    ]);
    setFlows(f.data); setTemplates(t.data); setCreds(c.data); setSupportedLangs(sl.data);
  };
  useEffect(() => { load(); }, []);

  const fromTemplate = async (tpl) => {
    if (!creds[0]) { toast.error('Connect a WhatsApp credential first'); return; }
    try {
      const { data } = await api.post(`/flows/from-template/${tpl.id}`, { credential_id: creds[0].id });
      toast.success(`${tpl.name} created`);
      navigate(`/app/flows/${data.id}`);
    } catch (e) { toast.error('Failed'); }
  };

  const blank = () => fromTemplate({ id: 'blank', name: 'Blank flow' });

  const aiCreate = async () => {
    if (!aiDesc.trim() || aiDesc.trim().length < 8) {
      toast.error('Describe what your bot should do (at least 8 chars)');
      return;
    }
    if (!creds[0]) { toast.error('Connect a WhatsApp credential first'); return; }
    setAiBusy(true);
    try {
      const { data: blankFlow } = await api.post('/flows/from-template/blank', { credential_id: creds[0].id });
      const { data: applied } = await api.post(`/flows/${blankFlow.id}/ai-scaffold`, { description: aiDesc });
      toast.success('Flow generated — opening builder');
      setAiOpen(false);
      setAiDesc('');
      navigate(`/app/flows/${blankFlow.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'AI generation failed');
    } finally { setAiBusy(false); }
  };

  const togglePublish = async (f) => {
    try {
      if (f.status === 'active') {
        await api.post(`/flows/${f.id}/unpublish`);
        toast.success('Unpublished');
      } else {
        await api.post(`/flows/${f.id}/publish`);
        toast.success('Published');
      }
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete flow and all sessions?')) return;
    await api.delete(`/flows/${id}`);
    load();
  };

  const showQr = async (f) => {
    if (f.status !== 'active') { toast.error('Publish the flow first'); return; }
    try {
      const { data } = await api.get(`/flows/${f.id}/qr`);
      setQr({ flow: f, ...data });
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  const downloadQr = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${qr.image_base64}`;
    a.download = `${(qr.flow.name || 'flow').replace(/\s+/g, '-')}-qr.png`;
    a.click();
  };

  const showAnalytics = async (f) => {
    try {
      const { data } = await api.get(`/flows/${f.id}/analytics`);
      setAnalytics({ flow: f, ...data });
    } catch (e) { toast.error('Failed'); }
  };

  const copy = (t) => { navigator.clipboard.writeText(t); toast.success('Copied'); };

  const openLang = async (f) => {
    try {
      const { data } = await api.get(`/flows/${f.id}/translations`);
      setLangModal({ flow: f, ...data });
    } catch (e) { toast.error('Failed to load translations'); }
  };

  const addLang = async (code) => {
    if (!langModal?.flow) return;
    setLangBusy(true);
    try {
      await api.post(`/flows/${langModal.flow.id}/translate`, { target_lang: code });
      toast.success('Translation generated');
      const { data } = await api.get(`/flows/${langModal.flow.id}/translations`);
      setLangModal({ ...langModal, ...data });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Translation failed');
    } finally { setLangBusy(false); }
  };

  const removeLang = async (code) => {
    if (!langModal?.flow) return;
    if (!window.confirm(`Remove ${code.toUpperCase()} translation?`)) return;
    try {
      await api.delete(`/flows/${langModal.flow.id}/translations/${code}`);
      const { data } = await api.get(`/flows/${langModal.flow.id}/translations`);
      setLangModal({ ...langModal, ...data });
      toast.success('Removed');
    } catch (e) { toast.error('Failed'); }
  };

  const openPublish = (f) => {
    if ((f.nodes || []).length < 2) { toast.error('Add at least 2 nodes before publishing'); return; }
    setPubModal({
      flow: f,
      name: f.name,
      description: f.description || '',
      category: 'Custom',
      tags: '',
    });
  };

  const submitPublish = async () => {
    if (!pubModal) return;
    if ((pubModal.description || '').trim().length < 10) {
      toast.error('Description must be at least 10 characters');
      return;
    }
    setPubBusy(true);
    try {
      const tags = (pubModal.tags || '').split(',').map(s => s.trim()).filter(Boolean);
      await api.post(`/marketplace/publish/${pubModal.flow.id}`, {
        name: pubModal.name,
        description: pubModal.description,
        category: pubModal.category,
        tags,
      });
      toast.success('Published to marketplace');
      setPubModal(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Publish failed');
    } finally { setPubBusy(false); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Chatbot Flows</h1>
          <p className="mt-1 text-sm text-zinc-600">Visual mind-map builder. Drag, connect, publish.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            data-testid="browse-marketplace"
            to="/app/marketplace"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            <Store className="h-4 w-4" /> Marketplace
          </Link>
          <button data-testid="ai-flow" onClick={() => setAiOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-wa-light/40 bg-gradient-to-r from-wa-dark to-wa-mid px-3.5 py-2 text-sm font-medium text-white hover:opacity-90">
            <Wand2 className="h-4 w-4" /> Generate flow
          </button>
          <button data-testid="new-flow" onClick={blank} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
            <Plus className="h-4 w-4" /> Blank flow
          </button>
        </div>
      </div>

      {/* Templates gallery */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-wa-mid" />
          <h2 className="font-display text-lg font-medium">Start from a template</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {templates.map(t => {
            const Icon = TPL_ICONS[t.id] || FileText;
            return (
              <button
                key={t.id}
                data-testid={`tpl-${t.id}`}
                onClick={() => fromTemplate(t)}
                className="group rounded-md border border-zinc-200 bg-white p-4 text-left transition hover:border-wa-light hover:bg-zinc-50"
              >
                <div className="flex items-center justify-between">
                  <div className="grid h-9 w-9 place-items-center rounded-md bg-wa-dark/5 text-wa-dark">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{t.category}</span>
                </div>
                <div className="mt-3 font-display text-sm font-semibold">{t.name}</div>
                <div className="mt-1 text-xs leading-relaxed text-zinc-500">{t.description}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Existing flows */}
      <section>
        <h2 className="font-display text-lg font-medium">Your flows</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 bg-white">
          {flows.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-zinc-500">
              <Workflow className="mx-auto mb-3 h-6 w-6 text-zinc-300" />
              No flows yet. Pick a template above or start blank.
            </div>
          )}
          {flows.map(f => (
            <div key={f.id} className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link to={`/app/flows/${f.id}`} className="font-medium text-zinc-900 hover:text-wa-dark">{f.name}</Link>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_BADGE[f.status]}`}>{f.status}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                  <span>{(f.nodes || []).length} nodes</span>
                  <span>·</span>
                  <span>{(f.edges || []).length} connections</span>
                  {f.triggers?.[0]?.keywords?.length > 0 && (
                    <>
                      <span>·</span>
                      <span>triggers on: <span className="font-mono">{f.triggers[0].keywords.slice(0, 3).join(', ')}</span></span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => openLang(f)} data-testid={`lang-${f.id}`} title="Translations" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-wa-dark">
                  <Languages className="h-4 w-4" />
                </button>
                <button onClick={() => openPublish(f)} data-testid={`publish-market-${f.id}`} title="Publish to marketplace" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-wa-dark">
                  <Upload className="h-4 w-4" />
                </button>
                <button onClick={() => showAnalytics(f)} data-testid={`analytics-${f.id}`} title="Analytics" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-wa-dark">
                  <BarChart3 className="h-4 w-4" />
                </button>
                <button onClick={() => showQr(f)} data-testid={`qr-${f.id}`} title="Deploy as QR code" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-wa-dark">
                  <QrCode className="h-4 w-4" />
                </button>
                <button onClick={() => togglePublish(f)} data-testid={`publish-${f.id}`} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium ${f.status === 'active' ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200' : 'bg-wa-dark text-white hover:bg-wa-mid'}`}>
                  <Power className="h-3 w-3" /> {f.status === 'active' ? 'Unpublish' : 'Publish'}
                </button>
                <Link to={`/app/flows/${f.id}`} className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-medium hover:bg-zinc-50">
                  <Edit className="h-3 w-3" /> Edit
                </Link>
                <button onClick={() => remove(f.id)} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-700">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI generator modal */}
      {aiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="inline-flex items-center gap-2 font-display text-lg font-semibold">
                <Wand2 className="h-4 w-4 text-wa-dark" /> Generate flow
              </h3>
              <button onClick={() => setAiOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-zinc-600">Describe your bot in plain English. We'll design a 4-8 node flow you can edit visually right after.</p>
            <textarea
              data-testid="ai-flow-desc"
              rows={4}
              value={aiDesc}
              onChange={(e) => setAiDesc(e.target.value)}
              placeholder="e.g. School admission inquiry — capture child's name, grade, parent contact, send confirmation"
              className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
            />
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {[
                'Restaurant table reservation',
                'Loan application qualifier',
                'Property site-visit booking',
                'IT support ticket triage',
                'Doctor appointment booking',
                'School admission inquiry',
              ].map(s => (
                <button key={s} onClick={() => setAiDesc(s)} className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 hover:bg-zinc-100">{s}</button>
              ))}
            </div>
            <button
              data-testid="ai-flow-generate"
              onClick={aiCreate}
              disabled={aiBusy}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-wa-dark to-wa-mid px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {aiBusy ? <>Designing flow… <Sparkles className="h-3.5 w-3.5 animate-pulse" /></> : <>Generate &amp; open builder <Wand2 className="h-3.5 w-3.5" /></>}
            </button>
          </div>
        </div>
      )}

      {/* QR modal */}
      {qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Deploy as QR · {qr.flow.name}</h3>
              <button onClick={() => setQr(null)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-zinc-600">Print this QR on counters, posters, packaging. Scanning opens WhatsApp pre-filled with the trigger keyword — instantly starting the bot.</p>
            <div className="mt-4 flex justify-center rounded-md border border-zinc-200 bg-white p-6">
              <img data-testid="qr-image" src={`data:image/png;base64,${qr.image_base64}`} alt="QR" className="h-56 w-56" />
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2">
                <code className="flex-1 truncate font-mono text-zinc-700">{qr.url}</code>
                <button onClick={() => copy(qr.url)} className="rounded p-1 hover:bg-zinc-100"><Copy className="h-3 w-3" /></button>
              </div>
              <div className="text-zinc-500">Trigger keyword: <span className="font-mono text-zinc-900">{qr.keyword}</span> · Number: <span className="font-mono text-zinc-900">+{qr.phone}</span></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setQr(null)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Close</button>
              <button data-testid="qr-download" onClick={downloadQr} className="inline-flex items-center gap-1 rounded-md bg-wa-dark px-3 py-2 text-sm text-white hover:bg-wa-mid">
                <Download className="h-3.5 w-3.5" /> Download PNG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analytics modal */}
      {analytics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Analytics · {analytics.flow.name}</h3>
              <button onClick={() => setAnalytics(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                ['Sessions', analytics.totals.sessions],
                ['Active', analytics.totals.active],
                ['Completed', analytics.totals.completed],
                ['Completion %', analytics.totals.completion_rate + '%'],
              ].map(([l, v]) => (
                <div key={l} className="rounded-md border border-zinc-200 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{l}</div>
                  <div className="mt-1 font-display text-2xl font-semibold text-wa-dark">{v}</div>
                </div>
              ))}
            </div>
            <h4 className="mt-5 font-display text-sm font-medium">Per-node performance</h4>
            <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-zinc-200">
              <table className="w-full text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Node</th>
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    <th className="px-3 py-2 text-left font-semibold">Visits</th>
                    <th className="px-3 py-2 text-left font-semibold">Drop-off</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.node_stats.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">No data yet — run a test or wait for real conversations.</td></tr>}
                  {analytics.node_stats.map(n => (
                    <tr key={n.node_id} className="border-b border-zinc-100 last:border-0">
                      <td className="max-w-xs truncate px-3 py-2">{n.label}</td>
                      <td className="px-3 py-2 capitalize text-zinc-600">{n.type}</td>
                      <td className="px-3 py-2 font-mono">{n.visits}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100">
                            <div className="h-full rounded-full bg-red-500" style={{ width: `${n.drop_off_pct}%` }} />
                          </div>
                          <span className="font-mono text-zinc-700">{n.drop_off_pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setAnalytics(null)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Languages modal */}
      {langModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold inline-flex items-center gap-2">
                <Languages className="h-4 w-4 text-wa-dark" /> Translations · {langModal.flow.name}
              </h3>
              <button onClick={() => setLangModal(null)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-zinc-600">
              Default language: <span className="font-mono uppercase">{langModal.default_language}</span>.
              When a customer messages in another language, the bot replies in that language automatically.
            </p>
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Available translations</div>
              <div className="mt-2 space-y-1.5">
                {(langModal.available || []).length === 0 && <div className="text-xs text-zinc-500">No translations yet.</div>}
                {(langModal.available || []).map(l => (
                  <div key={l.code} className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                    <div className="inline-flex items-center gap-2">
                      <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-700">{l.code}</span>
                      <span className="font-medium">{l.name}</span>
                      <span className="text-zinc-500">· {l.string_count} strings</span>
                    </div>
                    <button data-testid={`lang-remove-${l.code}`} onClick={() => removeLang(l.code)} className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Add a language</div>
              <div className="mt-2 flex gap-2">
                <select
                  data-testid="lang-select"
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) { addLang(e.target.value); e.target.value = ''; } }}
                  disabled={langBusy}
                >
                  <option value="">Pick target language…</option>
                  {supportedLangs
                    .filter(l => l.code !== (langModal.default_language || 'en'))
                    .filter(l => !(langModal.available || []).some(a => a.code === l.code))
                    .map(l => <option key={l.code} value={l.code}>{l.name} ({l.code})</option>)}
                </select>
              </div>
              {langBusy && <div className="mt-2 text-xs text-zinc-500 inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3 animate-pulse" /> Translating with AI…</div>}
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={() => setLangModal(null)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Publish to marketplace modal */}
      {pubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold inline-flex items-center gap-2">
                <Store className="h-4 w-4 text-wa-dark" /> Publish to marketplace
              </h3>
              <button onClick={() => setPubModal(null)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-zinc-600">Share this flow with the community. Other tenants can clone it as a starting point — your private credentials and conversations stay private.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Title</label>
                <input
                  data-testid="pub-name"
                  value={pubModal.name}
                  onChange={(e) => setPubModal({ ...pubModal, name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Description (min 10 chars)</label>
                <textarea
                  data-testid="pub-desc"
                  rows={3}
                  value={pubModal.description}
                  onChange={(e) => setPubModal({ ...pubModal, description: e.target.value })}
                  placeholder="Explain what this bot does, who it helps and how to customize it…"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Category</label>
                  <select
                    data-testid="pub-category"
                    value={pubModal.category}
                    onChange={(e) => setPubModal({ ...pubModal, category: e.target.value })}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  >
                    {['Sales', 'Support', 'Banking', 'Education', 'Real Estate', 'Healthcare', 'E-commerce', 'Hospitality', 'Custom'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Tags (comma-separated)</label>
                  <input
                    data-testid="pub-tags"
                    value={pubModal.tags}
                    onChange={(e) => setPubModal({ ...pubModal, tags: e.target.value })}
                    placeholder="lead, qualifier, b2b"
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPubModal(null)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
              <button
                data-testid="pub-submit"
                onClick={submitPublish}
                disabled={pubBusy}
                className="inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-3 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-50"
              >
                {pubBusy ? 'Publishing…' : <><Check className="h-3.5 w-3.5" /> Publish</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
