import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Copy, ExternalLink, QrCode, Download, Megaphone, Check, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function ShareLinksPanel({ credentialId, credentialName }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState('');

  const load = async () => {
    if (!credentialId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/whatsapp/credentials/${credentialId}/share-links`);
      setData(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No phone configured on this credential');
    } finally { setLoading(false); }
  };
  useEffect(() => { if (open && !data) load(); }, [open]); // eslint-disable-line

  const copy = (key, value) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    toast.success('Copied');
    setTimeout(() => setCopied(''), 1500);
  };

  return (
    <div className="rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 to-white">
      <button
        data-testid={`share-links-toggle-${credentialId}`}
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-white">
            <Megaphone className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-blue-950">Promote this number</div>
            <div className="text-xs text-blue-800">Get a wa.me link, QR code & embed snippet — paste anywhere</div>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-blue-700" /> : <ChevronRightIcon className="h-4 w-4 text-blue-700" />}
      </button>
      {open && (
        <div className="border-t border-blue-200 p-4">
          {loading && <div className="text-xs text-zinc-500">Loading…</div>}
          {data && (
            <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
              {/* QR code */}
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">QR code</div>
                <div className="grid place-items-center rounded-md border border-zinc-200 bg-white p-2">
                  {data.qr_image_url && (
                    <img
                      src={data.qr_image_url}
                      alt="WhatsApp QR"
                      data-testid={`qr-${credentialId}`}
                      className="h-40 w-40"
                    />
                  )}
                </div>
                <a
                  href={data.qr_image_url}
                  download={`${(credentialName || 'whatsapp').replace(/\s/g, '-')}-qr.svg`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] hover:bg-zinc-50 w-full"
                >
                  <Download className="h-3 w-3" /> Download SVG
                </a>
              </div>

              {/* Links */}
              <div className="space-y-3">
                <Field
                  label="wa.me deep link (with prefilled message)"
                  value={data.wa_link}
                  testId={`wa-link-${credentialId}`}
                  copied={copied === 'long'}
                  onCopy={() => copy('long', data.wa_link)}
                  preview="Open"
                />
                <Field
                  label="Short link"
                  value={data.wa_link_short}
                  testId={`wa-short-${credentialId}`}
                  copied={copied === 'short'}
                  onCopy={() => copy('short', data.wa_link_short)}
                />
                <Field
                  label="HTML embed snippet"
                  value={data.embed_snippet}
                  testId={`wa-embed-${credentialId}`}
                  copied={copied === 'embed'}
                  onCopy={() => copy('embed', data.embed_snippet)}
                  multiline
                />
                <div className="rounded-md bg-zinc-50 p-3 text-[11px] text-zinc-600">
                  <strong className="text-zinc-900">Where to paste these:</strong>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    <li>QR code: print on flyers, business cards, pop-up stalls</li>
                    <li>wa.me link: email signature, Linktree, social bios, &quot;Contact us&quot; buttons</li>
                    <li>Embed snippet: footer of your website + thank-you pages</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onCopy, copied, testId, preview, multiline }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="flex items-stretch gap-1">
        {multiline ? (
          <textarea
            data-testid={testId}
            value={value}
            readOnly
            rows={2}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[11px]"
          />
        ) : (
          <input
            data-testid={testId}
            value={value}
            readOnly
            className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[11px]"
          />
        )}
        <button
          onClick={onCopy}
          className={`rounded-md border px-2 text-[10px] font-medium transition ${copied ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-zinc-300 bg-white hover:bg-zinc-50'}`}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
        {preview && (
          <a href={value} target="_blank" rel="noreferrer"
             className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-2 hover:bg-zinc-50">
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
