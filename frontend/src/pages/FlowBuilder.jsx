import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, Handle, Position, MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import api from '../lib/api';
import { ArrowLeft, Plus, Save, Power, Send, Trash2, Settings, Play, MessageCircle, HelpCircle, GitBranch, Globe, ScanLine, X, Sparkles, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_META = {
  start: { label: 'Start', color: '#075E54', icon: Play },
  send: { label: 'Send message', color: '#16A34A', icon: MessageCircle },
  ask: { label: 'Ask question', color: '#0EA5E9', icon: HelpCircle },
  choice: { label: 'Choice menu', color: '#A855F7', icon: GitBranch },
  branch: { label: 'Keyword branch', color: '#F59E0B', icon: GitBranch },
  condition: { label: 'Condition (var)', color: '#0891B2', icon: ScanLine },
  api: { label: 'API / Webhook', color: '#475569', icon: Globe },
  end: { label: 'End', color: '#EF4444', icon: Power },
};

function NodeCard({ id, data, type, selected }) {
  const meta = TYPE_META[type] || TYPE_META.send;
  const Icon = meta.icon;
  const preview = data.message || data.prompt || data.label || '';
  const showInput = type !== 'start';
  const showOutput = type !== 'end';

  return (
    <div
      data-testid={`flow-node-${id}`}
      className={`min-w-[200px] max-w-[260px] rounded-md border bg-white text-xs shadow-sm transition ${selected ? 'border-wa-light ring-2 ring-wa-light/30' : 'border-zinc-300'}`}
    >
      {showInput && <Handle type="target" position={Position.Left} style={{ background: '#94a3b8', width: 8, height: 8 }} />}
      <div className="flex items-center gap-1.5 rounded-t-md px-2.5 py-1.5 text-white" style={{ background: meta.color }}>
        <Icon className="h-3 w-3" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{meta.label}</span>
      </div>
      <div className="p-2.5 text-zinc-800">
        {data.label && type === 'start' ? (
          <div className="text-zinc-500">Triggers the bot</div>
        ) : preview ? (
          <div className="line-clamp-3 whitespace-pre-line">{preview}</div>
        ) : (
          <div className="text-zinc-400">Click to configure…</div>
        )}
        {data.options && Array.isArray(data.options) && (
          <div className="mt-2 space-y-0.5">
            {data.options.slice(0, 4).map((o, i) => (
              <div key={i} className="rounded bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px]">{i + 1}. {o}</div>
            ))}
          </div>
        )}
        {data.variable && <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-amber-800">→ {`{{${data.variable}}}`}</div>}
      </div>
      {showOutput && <Handle type="source" position={Position.Right} style={{ background: '#94a3b8', width: 8, height: 8 }} />}
    </div>
  );
}

const nodeTypes = {
  start: NodeCard,
  send: NodeCard,
  ask: NodeCard,
  choice: NodeCard,
  branch: NodeCard,
  condition: NodeCard,
  api: NodeCard,
  end: NodeCard,
};

export default function FlowBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [flow, setFlow] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState(null);
  const [creds, setCreds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('+919999000001');
  const [testMsg, setTestMsg] = useState('hi');

  const load = useCallback(async () => {
    const [f, c] = await Promise.all([
      api.get(`/flows/${id}`),
      api.get('/whatsapp/credentials'),
    ]);
    const fl = f.data;
    setFlow(fl);
    setCreds(c.data);
    setNodes((fl.nodes || []).map(n => ({ id: n.id, type: n.type, position: n.position || { x: 0, y: 0 }, data: n.data || {} })));
    setEdges((fl.edges || []).map(e => ({
      id: e.id, source: e.source, target: e.target,
      label: e.label, animated: true, type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { stroke: '#075E54' },
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge({
    ...params, animated: true, type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: { stroke: '#075E54' },
  }, eds)), [setEdges]);

  const addNode = (type) => {
    const newId = `n${Date.now()}`;
    const center = { x: 250 + Math.random() * 200, y: 200 + Math.random() * 100 };
    const defaults = {
      send: { message: 'Hello! Please reply to continue.' },
      ask: { prompt: 'What is your name?', variable: 'name' },
      choice: { prompt: 'Pick one:', options: ['Option A', 'Option B'] },
      branch: { },
      condition: { variable: 'amount', operator: '>', value: '10000' },
      api: { url: 'https://your-erp.com/webhook', method: 'POST' },
      end: { message: 'Thanks for chatting!' },
      start: { label: 'Start' },
    }[type] || {};
    setNodes((ns) => [...ns, { id: newId, type, position: center, data: defaults }]);
  };

  const removeNode = (nodeId) => {
    setNodes(ns => ns.filter(n => n.id !== nodeId));
    setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelected(null);
  };

  const updateNodeData = (nodeId, patch) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
    setSelected(s => s ? { ...s, data: { ...s.data, ...patch } } : s);
  };

  const updateEdgeLabel = (edgeId, label) => {
    setEdges(es => es.map(e => e.id === edgeId ? { ...e, label } : e));
  };

  const toApi = () => ({
    name: flow.name,
    description: flow.description,
    credential_id: flow.credential_id,
    triggers: flow.triggers || [],
    start_node_id: nodes.find(n => n.type === 'start')?.id || (nodes[0]?.id),
    nodes: nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
    edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label, data: e.data })),
  });

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/flows/${id}`, toApi());
      toast.success('Saved');
      load();
    } catch (e) { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const togglePublish = async () => {
    try {
      await save();
      if (flow.status === 'active') {
        await api.post(`/flows/${id}/unpublish`);
        toast.success('Unpublished');
      } else {
        await api.post(`/flows/${id}/publish`);
        toast.success('Live ✓');
      }
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  const test = async () => {
    try {
      await save();
      await api.post(`/flows/${id}/test`, { customer_phone: testPhone, message: testMsg });
      toast.success('Triggered — check Live Chat for the conversation');
      setTestOpen(false);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  if (!flow) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/app/flows" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"><ArrowLeft className="h-4 w-4" /></Link>
          <input
            data-testid="flow-name"
            value={flow.name}
            onChange={(e) => setFlow({ ...flow, name: e.target.value })}
            className="border-none bg-transparent font-display text-base font-semibold tracking-tight outline-none focus:ring-0"
          />
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${flow.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-700'}`}>{flow.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            data-testid="flow-cred"
            value={flow.credential_id || ''}
            onChange={(e) => setFlow({ ...flow, credential_id: e.target.value })}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">— pick WA connection —</option>
            {creds.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button data-testid="flow-test" onClick={() => setTestOpen(true)} className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50">
            <Send className="h-3 w-3" /> Test
          </button>
          <button data-testid="flow-save" onClick={save} disabled={saving} className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-60">
            <Save className="h-3 w-3" /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button data-testid="flow-publish" onClick={togglePublish} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${flow.status === 'active' ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200' : 'bg-wa-dark text-white hover:bg-wa-mid'}`}>
            <Power className="h-3 w-3" /> {flow.status === 'active' ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left palette */}
        <aside className="flex w-56 flex-col border-r border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Add nodes</div>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
            {Object.entries(TYPE_META).filter(([k]) => k !== 'start').map(([key, meta]) => (
              <button
                key={key}
                data-testid={`palette-${key}`}
                onClick={() => addNode(key)}
                className="flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs hover:bg-zinc-50"
              >
                <div className="grid h-6 w-6 place-items-center rounded text-white" style={{ background: meta.color }}>
                  <meta.icon className="h-3 w-3" />
                </div>
                <span className="font-medium text-zinc-800">{meta.label}</span>
                <Plus className="ml-auto h-3 w-3 text-zinc-400" />
              </button>
            ))}
          </div>
          <div className="border-t border-zinc-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Triggers</div>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">Comma-separated keywords. The bot starts when an inbound message contains any of these.</p>
            <input
              data-testid="flow-triggers"
              value={(flow.triggers?.[0]?.keywords || []).join(', ')}
              onChange={(e) => setFlow({ ...flow, triggers: [{ type: 'keyword', keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }] })}
              placeholder="hi, start, hello"
              className="mt-2 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
            />
          </div>
        </aside>

        {/* Canvas */}
        <div className="flex-1 bg-zinc-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected({ kind: 'node', ...n })}
            onEdgeClick={(_, e) => setSelected({ kind: 'edge', ...e })}
            onPaneClick={() => setSelected(null)}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
          >
            <Background color="#cbd5e1" gap={20} />
            <Controls />
            <MiniMap nodeColor={(n) => TYPE_META[n.type]?.color || '#94a3b8'} pannable zoomable />
          </ReactFlow>
        </div>

        {/* Right inspector */}
        <aside className="flex w-72 flex-col border-l border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Inspector</div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 text-sm">
            {!selected && (
              <div className="text-xs leading-relaxed text-zinc-500">
                <Sparkles className="mb-2 h-3.5 w-3.5 text-wa-mid" />
                Click a node or edge to edit. Drag handles between nodes to connect them. Use <span className="font-mono">{`{{var_name}}`}</span> in messages to inject captured variables.
              </div>
            )}
            {selected?.kind === 'node' && (
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Node · {TYPE_META[selected.type]?.label}</div>

                {(selected.type === 'send' || selected.type === 'end') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Message</label>
                    <textarea
                      data-testid="node-message"
                      rows={4}
                      value={selected.data?.message || ''}
                      onChange={(e) => updateNodeData(selected.id, { message: e.target.value })}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
                    />
                    <p className="mt-1 text-[10px] text-zinc-500">Use {`{{name}}`} to inject variables.</p>
                  </div>
                )}

                {selected.type === 'ask' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">Prompt</label>
                      <textarea
                        data-testid="node-prompt"
                        rows={3}
                        value={selected.data?.prompt || ''}
                        onChange={(e) => updateNodeData(selected.id, { prompt: e.target.value })}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">Save reply to variable</label>
                      <input
                        data-testid="node-variable"
                        value={selected.data?.variable || ''}
                        onChange={(e) => updateNodeData(selected.id, { variable: e.target.value.replace(/\s/g, '_') })}
                        placeholder="name"
                        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-xs"
                      />
                    </div>
                  </>
                )}

                {selected.type === 'choice' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">Prompt</label>
                      <textarea
                        rows={3}
                        value={selected.data?.prompt || ''}
                        onChange={(e) => updateNodeData(selected.id, { prompt: e.target.value })}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">Options (one per line)</label>
                      <textarea
                        rows={4}
                        value={(selected.data?.options || []).join('\n')}
                        onChange={(e) => updateNodeData(selected.id, { options: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
                        placeholder="Yes\nNo"
                      />
                      <p className="mt-1 text-[10px] text-zinc-500">Add an outgoing edge per option and label the edge with the option text to route correctly.</p>
                    </div>
                  </>
                )}

                {selected.type === 'condition' && (
                  <>
                    <p className="text-[10px] leading-relaxed text-zinc-500">
                      Compare a captured variable against a value. Label outgoing edges <span className="font-mono">true</span> or <span className="font-mono">false</span> to route.
                    </p>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">Variable</label>
                      <input
                        data-testid="cond-variable"
                        value={selected.data?.variable || ''}
                        onChange={(e) => updateNodeData(selected.id, { variable: e.target.value.replace(/\s/g, '_') })}
                        placeholder="amount"
                        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-700">Operator</label>
                        <select
                          value={selected.data?.operator || '=='}
                          onChange={(e) => updateNodeData(selected.id, { operator: e.target.value })}
                          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
                        >
                          {['==', '!=', '>', '<', '>=', '<=', 'contains', 'starts_with', 'ends_with'].map(op => <option key={op}>{op}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-700">Value</label>
                        <input
                          value={selected.data?.value || ''}
                          onChange={(e) => updateNodeData(selected.id, { value: e.target.value })}
                          placeholder="10000"
                          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  </>
                )}

                {selected.type === 'api' && (
                  <>
                    <p className="text-[10px] leading-relaxed text-zinc-500">
                      Sends a POST with all captured variables to the URL. Useful for ERP/CRM integration.
                    </p>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">URL</label>
                      <input
                        data-testid="api-url"
                        type="url"
                        value={selected.data?.url || ''}
                        onChange={(e) => updateNodeData(selected.id, { url: e.target.value })}
                        placeholder="https://your-erp.com/webhook"
                        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div className="rounded-md bg-zinc-50 p-2 font-mono text-[10px] leading-snug text-zinc-600">
                      {`POST { variables, phone }`}
                    </div>
                  </>
                )}

                {selected.type !== 'start' && (
                  <button
                    onClick={() => removeNode(selected.id)}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3 w-3" /> Delete node
                  </button>
                )}
              </div>
            )}

            {selected?.kind === 'edge' && (
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Edge</div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Label / condition</label>
                  <input
                    value={selected.label || ''}
                    onChange={(e) => updateEdgeLabel(selected.id, e.target.value)}
                    placeholder="e.g. Yes"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">For Choice/Branch nodes, label this edge with the option text to route here when matched.</p>
                </div>
                <button
                  onClick={() => { setEdges(es => es.filter(x => x.id !== selected.id)); setSelected(null); }}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-3 w-3" /> Delete edge
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {testOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Test flow</h3>
              <button onClick={() => setTestOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-zinc-600">Triggers a test conversation with this flow. The bot's responses will appear in Live Chat.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Test phone</label>
                <input data-testid="test-phone" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Inbound message</label>
                <input data-testid="test-msg" value={testMsg} onChange={(e) => setTestMsg(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              </div>
              <button data-testid="test-run" onClick={test} className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-wa-dark px-3 py-2 text-sm font-medium text-white hover:bg-wa-mid">
                Run test <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
