import React, { useEffect, useMemo, useRef, useState } from 'react';
import api, { API_BASE } from '../lib/api';
import { Send, Sparkles, Search, MessageCircle, RefreshCw, Zap, Plus, X, Megaphone } from 'lucide-react';
import { toast } from 'sonner';

const fmtTime = (s) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function Chat() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [creds, setCreds] = useState([]);
  const [credentialId, setCredentialId] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [search, setSearch] = useState('');
  const [quickReplies, setQuickReplies] = useState([]);
  const [showSlash, setShowSlash] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrForm, setQrForm] = useState({ shortcut: '', body: '' });
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const loadConvs = async () => {
    const { data } = await api.get('/conversations');
    setConversations(data);
  };
  const loadCreds = async () => {
    const { data } = await api.get('/whatsapp/credentials');
    setCreds(data);
    if (data[0]) setCredentialId(data[0].id);
  };
  const loadQuickReplies = async () => {
    try {
      const { data } = await api.get('/quick-replies');
      setQuickReplies(data);
    } catch { /* ignore */ }
  };
  const saveQR = async (e) => {
    e.preventDefault();
    try {
      await api.post('/quick-replies', { shortcut: qrForm.shortcut, body: qrForm.body });
      toast.success('Quick reply saved');
      setShowQRModal(false);
      setQrForm({ shortcut: '', body: '' });
      loadQuickReplies();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Save failed'); }
  };
  const insertQR = (qr) => {
    setInput(qr.body);
    setShowSlash(false);
    api.post(`/quick-replies/${qr.id}/use`).catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const onInputChange = (e) => {
    const v = e.target.value;
    setInput(v);
    if (v.startsWith('/') && v.indexOf(' ') === -1) {
      setSlashFilter(v.slice(1).toLowerCase());
      setShowSlash(true);
    } else {
      setShowSlash(false);
    }
  };
  const filteredQR = quickReplies.filter(q =>
    !slashFilter || q.shortcut.includes(slashFilter) || q.body.toLowerCase().includes(slashFilter)
  );
  const loadMessages = async (id) => {
    const { data } = await api.get(`/conversations/${id}/messages`);
    setMessages(data);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    // pull AI suggestion
    try {
      const { data: s } = await api.get(`/conversations/${id}/ai-suggestion`);
      setSuggestion(s.suggestion || '');
    } catch { setSuggestion(''); }
  };

  useEffect(() => { loadConvs(); loadCreds(); loadQuickReplies(); }, []);

  // WebSocket for real-time message broadcast
  useEffect(() => {
    const token = localStorage.getItem('wa_token');
    if (!token) return;
    const wsBase = API_BASE.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/ws?token=${encodeURIComponent(token)}`;
    let ws;
    let reconnectTimer;
    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.type === 'message') {
              loadConvs();
              if (active && data.conversation_id === active.id) {
                loadMessages(active.id);
              }
            }
          } catch {}
        };
        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 3000);
        };
        ws.onerror = () => {};
      } catch { reconnectTimer = setTimeout(connect, 3000); }
    };
    connect();
    return () => {
      try { ws?.close(); } catch {}
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  useEffect(() => {
    if (!active) return;
    loadMessages(active.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const s = search.toLowerCase();
    return conversations.filter(c =>
      (c.customer_name || '').toLowerCase().includes(s) ||
      (c.customer_phone || '').includes(s) ||
      (c.last_message || '').toLowerCase().includes(s)
    );
  }, [conversations, search]);

  const send = async () => {
    if (!input.trim() || !active) return;
    if (!credentialId) { toast.error('Pick a WhatsApp connection'); return; }
    const text = input.trim();
    setInput('');
    setMessages(m => [...m, { id: 'tmp-' + Date.now(), direction: 'outbound', content: text, status: 'sending', sent_at: new Date().toISOString() }]);
    try {
      await api.post(`/conversations/${active.id}/send`, { credential_id: credentialId, to_phone: active.customer_phone, content: text });
      loadMessages(active.id);
    } catch (e) {
      toast.error('Send failed');
    }
  };

  const useSuggestion = () => { if (suggestion) setInput(suggestion); };

  const sentimentColor = (s) => s === 'positive' ? 'text-wa-dark' : s === 'negative' ? 'text-red-700' : 'text-zinc-600';

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-12">
      {/* Conversations list */}
      <aside className="col-span-12 flex flex-col border-r border-zinc-200 bg-white sm:col-span-4 lg:col-span-3">
        <div className="border-b border-zinc-200 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Inbox</div>
            <button onClick={loadConvs} className="rounded p-1 text-zinc-500 hover:bg-zinc-100"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input data-testid="chat-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-wa-light" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && <div className="p-6 text-center text-xs text-zinc-500">No conversations.</div>}
          {filtered.map(c => (
            <button
              key={c.id}
              data-testid={`conv-${c.id}`}
              onClick={() => setActive(c)}
              className={`flex w-full items-start gap-2.5 border-b border-zinc-100 px-3 py-3 text-left transition ${active?.id === c.id ? 'bg-zinc-50' : 'hover:bg-zinc-50/50'}`}
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">
                {(c.customer_name || c.customer_phone || '?').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <div className="truncate text-sm font-medium text-zinc-900">{c.customer_name || c.customer_phone}</div>
                  <span className="shrink-0 text-[10px] text-zinc-500">{c.last_message_at ? fmtTime(c.last_message_at) : ''}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <div className="truncate text-xs text-zinc-500">{c.last_message || '—'}</div>
                  <div className="flex shrink-0 items-center gap-1">
                    {c.unread_count > 0 && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-semibold text-white">{c.unread_count}</span>
                    )}
                    <span className="text-[10px] font-medium text-zinc-400">{c.lead_score}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat area */}
      <section className="col-span-12 flex flex-col border-r border-zinc-200 bg-white sm:col-span-8 lg:col-span-6">
        {active ? (
          <>
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-green-700 text-xs font-semibold text-white">
                  {(active.customer_name || active.customer_phone || '?').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-900">{active.customer_name || active.customer_phone}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <span>{active.customer_phone}</span>
                    <span>·</span>
                    <span className={sentimentColor(active.sentiment)}>{active.sentiment || 'neutral'}</span>
                    {active.referral && (
                      <span data-testid="ctwa-badge" title={active.referral.source_url || active.referral.headline || 'Click-to-WhatsApp ad'} className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-purple-800">
                        <Megaphone className="h-2.5 w-2.5" /> from ad
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  data-testid="manage-quick-replies"
                  onClick={() => setShowQRModal(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] hover:bg-zinc-50"
                  title="Manage quick replies"
                >
                  <Zap className="h-3 w-3 text-wa-dark" /> {quickReplies.length}
                </button>
                <select value={credentialId} onChange={(e) => setCredentialId(e.target.value)} className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs">
                  {creds.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="bg-wa-pattern flex-1 overflow-y-auto px-4 py-5">
              <div className="space-y-3">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                      m.direction === 'outbound' ? 'rounded-tr-none bg-wa-bubble-out text-zinc-900' : 'rounded-tl-none bg-white text-zinc-800 ring-1 ring-zinc-200'
                    }`}>
                      <div>{m.content}</div>
                      <div className={`mt-1 text-[10px] ${m.direction === 'outbound' ? 'text-wa-mid' : 'text-zinc-400'}`}>
                        {fmtTime(m.sent_at)} {m.direction === 'outbound' && <span className="ml-1">{m.status === 'sending' ? '⌛' : m.status === 'failed' ? '!' : '✓✓'}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            </div>
            <div className="border-t border-zinc-200 p-3">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  data-testid="chat-input"
                  value={input}
                  onChange={onInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !showSlash) send();
                    if (e.key === 'Escape') setShowSlash(false);
                  }}
                  placeholder="Reply… (type / for snippets)"
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-wa-light"
                />
                <button data-testid="chat-send" onClick={send} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid">
                  <Send className="h-3.5 w-3.5" /> Send
                </button>
              </div>
              {showSlash && filteredQR.length > 0 && (
                <div data-testid="slash-popover" className="mb-2 max-h-56 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-md">
                  <div className="border-b border-zinc-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    <Zap className="mr-1 inline h-3 w-3 text-wa-dark" /> Quick replies — Esc to close
                  </div>
                  {filteredQR.map(qr => (
                    <button
                      key={qr.id}
                      type="button"
                      data-testid={`qr-${qr.shortcut}`}
                      onClick={() => insertQR(qr)}
                      className="block w-full border-b border-zinc-100 px-3 py-2 text-left text-xs hover:bg-zinc-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-wa-dark">/{qr.shortcut}</span>
                        <span className="text-[10px] text-zinc-400">used {qr.use_count || 0}×</span>
                      </div>
                      <div className="mt-0.5 line-clamp-1 text-zinc-700">{qr.body}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
            <div className="text-center">
              <MessageCircle className="mx-auto h-8 w-8 text-zinc-300" />
              <div className="mt-3">Pick a conversation to start chatting</div>
            </div>
          </div>
        )}
      </section>

      {/* AI / Context */}
      <aside className="col-span-12 hidden flex-col bg-white lg:col-span-3 lg:flex">
        <div className="border-b border-zinc-200 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-wa-dark">Workflow Co-pilot</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {active ? (
            <>
              <div className="rounded-md border border-zinc-200 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-900">
                  <Sparkles className="h-3.5 w-3.5 text-wa-dark" /> Smart reply
                </div>
                <div className="text-xs leading-relaxed text-zinc-700">{suggestion || '—'}</div>
                <button data-testid="use-suggestion" onClick={useSuggestion} disabled={!suggestion} className="mt-3 w-full rounded-md border border-zinc-300 bg-white py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50">
                  Use suggestion
                </button>
              </div>

              <div className="mt-4 rounded-md bg-zinc-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Lead</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-700">
                  <div><div className="text-zinc-400">Score</div><div className="font-display text-base font-semibold text-zinc-900">{active.lead_score}</div></div>
                  <div><div className="text-zinc-400">Sentiment</div><div className={`text-sm font-medium ${sentimentColor(active.sentiment)}`}>{active.sentiment || 'neutral'}</div></div>
                  <div><div className="text-zinc-400">Phone</div><div className="font-mono">{active.customer_phone}</div></div>
                  <div><div className="text-zinc-400">Status</div><div className="capitalize">{active.status}</div></div>
                </div>
                {active.referral && (
                  <div className="mt-3 rounded-md border border-purple-200 bg-purple-50 p-2 text-[11px]">
                    <div className="font-semibold uppercase tracking-wider text-purple-800 inline-flex items-center gap-1"><Megaphone className="h-3 w-3" /> CTWA attribution</div>
                    {active.referral.source_url && <div className="mt-0.5 truncate text-purple-900">{active.referral.source_url}</div>}
                    {active.referral.headline && <div className="text-purple-700">"{active.referral.headline}"</div>}
                    {active.referral.source_id && <div className="font-mono text-[10px] text-purple-600">ad {active.referral.source_id}</div>}
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-1.5 text-xs">
                {[
                  'Hello! How can I help you today?',
                  'Sharing pricing on WhatsApp now.',
                  'Could you share your business name and city?',
                ].map((t) => (
                  <button key={t} onClick={() => setInput(t)} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-zinc-700 hover:bg-zinc-50">
                    {t}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="text-xs text-zinc-500">No conversation selected.</div>
          )}
        </div>
      </aside>

      {showQRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowQRModal(false)}>
          <div className="w-full max-w-lg rounded-md border border-zinc-200 bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold inline-flex items-center gap-2"><Zap className="h-4 w-4 text-wa-dark" /> Quick replies</h3>
              <button onClick={() => setShowQRModal(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-zinc-500">Type <code className="rounded bg-zinc-100 px-1">/shortcut</code> in the reply box to insert a saved snippet.</p>
            <form onSubmit={saveQR} className="mb-3 grid grid-cols-[100px_1fr_auto] gap-1.5">
              <input
                data-testid="qr-shortcut"
                required
                placeholder="shortcut"
                value={qrForm.shortcut}
                onChange={(e) => setQrForm({ ...qrForm, shortcut: e.target.value })}
                className="rounded-md border border-zinc-300 px-2 py-2 font-mono text-xs"
              />
              <input
                data-testid="qr-body"
                required
                placeholder="Reply text…"
                value={qrForm.body}
                onChange={(e) => setQrForm({ ...qrForm, body: e.target.value })}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <button data-testid="qr-save" className="inline-flex items-center gap-1 rounded-md bg-wa-dark px-3 py-2 text-xs font-medium text-white"><Plus className="h-3 w-3" /> Add</button>
            </form>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {quickReplies.length === 0 && <div className="py-6 text-center text-xs text-zinc-400">No snippets yet. Add one above.</div>}
              {quickReplies.map(qr => (
                <div key={qr.id} className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-xs">
                  <span className="font-mono font-semibold text-wa-dark">/{qr.shortcut}</span>
                  <span className="flex-1 truncate text-zinc-700">{qr.body}</span>
                  <span className="text-[10px] text-zinc-400">{qr.use_count || 0}×</span>
                  <button
                    data-testid={`qr-delete-${qr.shortcut}`}
                    onClick={async () => { await api.delete(`/quick-replies/${qr.id}`); loadQuickReplies(); }}
                    className="text-zinc-400 hover:text-red-700"
                  ><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
