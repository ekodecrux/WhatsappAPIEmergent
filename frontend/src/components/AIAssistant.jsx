import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Sparkles, X, Send, Wand2, Loader2, ExternalLink, MessageSquare, Workflow, Zap, LifeBuoy } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const ACTION_ICONS = {
  create_campaign: MessageSquare,
  draft_flow: Workflow,
  send_test_message: Zap,
  navigate: ExternalLink,
  raise_ticket: LifeBuoy,
};

const ACTION_LABEL = {
  create_campaign: 'Open campaign builder with this draft',
  draft_flow: 'Generate this flow & open builder',
  send_test_message: 'Open Test send with these values',
  navigate: 'Take me there',
  raise_ticket: 'Raise this ticket',
};

const SUGGESTED = [
  'How do I create my first campaign?',
  'Design a chatbot flow for restaurant reservations',
  'Why aren\'t my Twilio sandbox messages delivering?',
  'Send a test message to +91…',
];

export default function AIAssistant() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Hi ${user?.full_name?.split(' ')[0] || 'there'} — I'm your wabridge AI assistant. Ask me anything, or tell me what to do.`, type: 'text' },
  ]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    const next = [...messages, { role: 'user', content: msg, type: 'text' }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const history = next.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const { data } = await api.post('/assistant/chat', {
        message: msg,
        history,
        page_context: {
          route: location.pathname,
          plan: user?.plan,
          company: user?.company_name,
        },
      });
      setMessages(m => [...m, { role: 'assistant', ...data }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', type: 'text', content: 'Sorry, I hit an error. Please try again or open Support.' }]);
    } finally { setBusy(false); }
  };

  const runAction = async (a) => {
    const { kind, params = {} } = a || {};
    try {
      if (kind === 'navigate') {
        navigate(params.to || '/app');
        setOpen(false);
        return;
      }
      if (kind === 'raise_ticket') {
        const { data } = await api.post('/support/tickets', {
          subject: params.subject || 'AI-assisted ticket',
          description: params.description || 'Raised from AI assistant',
          priority: ['low', 'normal', 'high', 'urgent'].includes(params.priority) ? params.priority : 'normal',
          category: 'general',
          source: 'chatbot',
        });
        toast.success(`Ticket #${data.id.slice(0, 8)} created`);
        setMessages(m => [...m, { role: 'assistant', type: 'text', content: `Ticket created — opening Support page.` }]);
        navigate('/app/support');
        setOpen(false);
        return;
      }
      if (kind === 'draft_flow') {
        // Create blank flow then apply AI scaffold using description
        const { data: creds } = await api.get('/whatsapp/credentials');
        if (!creds[0]) { toast.error('Connect a WhatsApp credential first'); return; }
        const { data: blank } = await api.post('/flows/from-template/blank', { credential_id: creds[0].id });
        await api.post(`/flows/${blank.id}/ai-scaffold`, {
          description: params.description || 'Draft flow',
          triggers: params.triggers || [],
        });
        toast.success('Flow generated — opening builder');
        navigate(`/app/flows/${blank.id}`);
        setOpen(false);
        return;
      }
      if (kind === 'create_campaign') {
        // Take user to campaigns page with draft prefilled in sessionStorage
        sessionStorage.setItem('wa_ai_campaign_draft', JSON.stringify(params));
        toast.success('Draft saved — opening Campaigns');
        navigate('/app/campaigns');
        setOpen(false);
        return;
      }
      if (kind === 'send_test_message') {
        sessionStorage.setItem('wa_ai_test_send', JSON.stringify(params));
        toast.success('Prefilled — opening WhatsApp Setup');
        navigate('/app/whatsapp');
        setOpen(false);
        return;
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Action failed');
    }
  };

  if (!user?.access_token) return null;

  return (
    <>
      {!open && (
        <button
          data-testid="ai-assistant-open"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-wa-dark to-wa-mid px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:scale-[1.02] hover:shadow-xl"
        >
          <Sparkles className="h-4 w-4" /> Ask AI
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[640px] max-h-[calc(100vh-2.5rem)] w-[420px] max-w-[calc(100vw-2.5rem)] flex-col rounded-lg border border-zinc-200 bg-white shadow-2xl" data-testid="ai-assistant-panel">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div className="inline-flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-wa-dark to-wa-mid text-white">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <div>
                <div className="text-sm font-semibold">wabridge AI</div>
                <div className="text-[10px] text-zinc-500">{location.pathname}</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"><X className="h-4 w-4" /></button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => {
              if (m.role === 'user') {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-lg rounded-br-sm bg-wa-dark px-3 py-2 text-sm text-white">{m.content}</div>
                  </div>
                );
              }
              return (
                <div key={i} className="flex flex-col gap-2">
                  <div className="max-w-[90%] rounded-lg rounded-bl-sm bg-zinc-100 px-3 py-2 text-sm text-zinc-800 whitespace-pre-wrap">{m.message || m.content}</div>
                  {m.type === 'action' && m.action && (() => {
                    const Icon = ACTION_ICONS[m.action.kind] || Wand2;
                    return (
                      <button
                        data-testid={`ai-action-${m.action.kind}`}
                        onClick={() => runAction(m.action)}
                        className="ml-1 inline-flex w-fit items-center gap-1.5 rounded-md border border-wa-light/40 bg-gradient-to-r from-wa-dark/5 to-wa-mid/5 px-2.5 py-1.5 text-xs font-medium text-wa-dark hover:bg-wa-dark/10"
                      >
                        <Icon className="h-3 w-3" /> {ACTION_LABEL[m.action.kind] || 'Run action'}
                      </button>
                    );
                  })()}
                  {m.type === 'ticket' && m.ticket_id && (
                    <button onClick={() => { navigate('/app/support'); setOpen(false); }} className="ml-1 inline-flex w-fit items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50">
                      <LifeBuoy className="h-3 w-3" /> View ticket #{m.ticket_id.slice(0, 8)}
                    </button>
                  )}
                </div>
              );
            })}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
              </div>
            )}
            {messages.length <= 1 && !busy && (
              <div className="mt-4 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Try asking</div>
                {SUGGESTED.map(s => (
                  <button key={s} onClick={() => send(s)} data-testid="ai-suggestion" className="block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-zinc-200 p-3">
            <div className="flex items-center gap-2">
              <input
                data-testid="ai-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything or tell me what to do…"
                disabled={busy}
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
              />
              <button
                data-testid="ai-send"
                type="submit"
                disabled={busy || !input.trim()}
                className="inline-flex items-center justify-center rounded-md bg-wa-dark p-2 text-white hover:bg-wa-mid disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1.5 text-[10px] text-zinc-400">Powered by Groq · Context-aware to {location.pathname}</div>
          </form>
        </div>
      )}
    </>
  );
}
