import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Download, X } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';

export default function PaymentChat({ request, onClose }) {
  const { theme } = useTheme();
  const dark = theme === 'bg-skin-black';
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    axios.get(`/subscription-requests/${request.id}/messages`)
      .then(response => !cancelled && setMessages(response.data?.messages ?? []))
      .catch(() => !cancelled && setError('Unable to load the archived conversation.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [request.id]);

  const shell = dark ? 'border-[#2a2e39] bg-[#131722] text-white' : 'border-slate-200 bg-white text-slate-900';
  const surface = dark ? 'border-[#2a2e39] bg-[#0b0e14]' : 'border-slate-200 bg-slate-50';
  return <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/75 p-4">
    <section className={`flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${shell}`} aria-label="Archived payment conversation">
      <header className={`flex items-start justify-between border-b p-5 ${surface}`}><div><h2 className="text-lg font-bold">Archived payment conversation</h2><p className="mt-1 text-xs text-[#787b86]">This manual-payment record is preserved for reference and cannot receive new messages.</p></div><button type="button" onClick={onClose} className="rounded p-2 text-[#787b86]" aria-label="Close conversation"><X size={18}/></button></header>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {loading && <p className="text-sm text-[#787b86]">Loading conversation…</p>}
        {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}
        {!loading && !messages.length && <p className="py-10 text-center text-sm text-[#787b86]">No archived messages.</p>}
        {messages.map(message => <article key={message.id} className={`max-w-[85%] rounded-xl border p-3 ${message.mine ? 'ml-auto border-[#2dd4bf]/40 bg-[#2dd4bf]/10' : surface}`}><div className="text-[10px] font-bold uppercase tracking-wider text-[#787b86]">{message.user?.name ?? 'User'} · {new Date(message.created_at).toLocaleString()}</div>{message.message && <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.message}</p>}{message.attachment_url && <a href={message.attachment_url} className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#5eead4]"><Download size={14}/>{message.attachment_name ?? 'Download attachment'}</a>}</article>)}
      </div>
    </section>
  </div>;
}
