import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Trash2, Power, Play, Edit, Sparkles, Workflow, Banknote, GraduationCap, Target, LifeBuoy, FileText } from 'lucide-react';
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

  const load = async () => {
    const [f, t, c] = await Promise.all([
      api.get('/flows'),
      api.get('/flows/templates'),
      api.get('/whatsapp/credentials'),
    ]);
    setFlows(f.data); setTemplates(t.data); setCreds(c.data);
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

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Chatbot Flows</h1>
          <p className="mt-1 text-sm text-zinc-600">Visual mind-map builder. Drag, connect, publish.</p>
        </div>
        <button data-testid="new-flow" onClick={blank} className="inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid">
          <Plus className="h-4 w-4" /> Blank flow
        </button>
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
    </div>
  );
}
