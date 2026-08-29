import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { ArrowLeft, CandlestickChart, ChevronRight, ImagePlus, LoaderCircle, MessageSquarePlus, Plus, Send, X } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';
import { useToast } from '../../Context/ToastContext';

// The Product Hub's own category set. Mirrors the product half of
// UserFeedbackController::CATEGORIES — the support half (payment, subscription,
// account) stays on Pages/Feedback/Index.jsx, which owns the transaction picker and
// the support-chat thread. See docs/developer/feedback.md.
export const PRODUCT_TYPES = [
  ['chart', 'Chart'],
  ['trading', 'Trading'],
  ['replay', 'Replay & Backtest'],
  ['usability', 'User Experience'],
  ['performance', 'Performance'],
  ['bug', 'Bug'],
  ['other', 'Other'],
];
const typeLabels = Object.fromEntries(PRODUCT_TYPES);

const MAX_ATTACHMENTS = 4;
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const DETAILS_LIMIT = 1500;

const statusStyles = {
  submitted: 'bg-slate-500/15 text-slate-400', reviewing: 'bg-blue-500/15 text-blue-400', planned: 'bg-violet-500/15 text-violet-400',
  in_progress: 'bg-amber-500/15 text-amber-400', completed: 'bg-emerald-500/15 text-emerald-400', declined: 'bg-red-500/15 text-red-400',
};

const emptyForm = { category: '', title: '', description: '' };

// "BTCUSDT · BYBIT linear · 15m · replay" — what the chart looked like when the
// report was filed. Rendered here so the user can see what they're attaching, and
// again in the admin detail pane so a chart bug arrives triageable.
export function contextChipLabel(context) {
  if (!context) return '';
  const market = [context.exchange && String(context.exchange).toUpperCase(), context.category].filter(Boolean).join(' ');
  return [context.symbol, market, context.timeframe, context.replayMode ? 'replay' : null].filter(Boolean).join(' · ');
}

export default function ProductHubModal({ open, onClose, chartTheme = null, context = null }) {
  const { theme } = useTheme();
  const { handleToast } = useToast();
  // From the chart the modal inherits that chart's palette so it doesn't fight the
  // surface it opened over; from /feedback there is no chartTheme and it falls back
  // to the app-wide theme check every other page-level component here uses.
  const dark = chartTheme ? chartTheme.mode === 'dark' : theme === 'bg-skin-black';

  const [tab, setTab] = useState('suggestion');
  const [view, setView] = useState('form');
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [changelog, setChangelog] = useState(null);
  const [loadingChangelog, setLoadingChangelog] = useState(false);
  const [changelogError, setChangelogError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const fileInputRef = useRef(null);

  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

  const loadItems = useCallback(() => {
    setLoadingItems(true);
    axios.get('/feedback/items')
      .then(({ data }) => setItems((data.feedback ?? []).filter((item) => item.isProduct)))
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false));
  }, []);

  const loadChangelog = useCallback(() => {
    setLoadingChangelog(true);
    setChangelogError('');
    axios.get('/changelog-feed')
      .then(({ data }) => setChangelog(data.announcements ?? []))
      .catch(() => setChangelogError('Unable to load the changelog.'))
      .finally(() => setLoadingChangelog(false));
  }, []);

  useEffect(() => { if (open && view === 'mine' && items === null && !loadingItems) loadItems(); }, [open, view, items, loadingItems, loadItems]);
  useEffect(() => { if (open && tab === 'changelog' && changelog === null && !loadingChangelog) loadChangelog(); }, [open, tab, changelog, loadingChangelog, loadChangelog]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList ?? []);
    if (!incoming.length) return;
    const room = MAX_ATTACHMENTS - files.length;
    if (room <= 0) { setFileError(`You can attach up to ${MAX_ATTACHMENTS} images.`); return; }

    const rejected = [];
    const accepted = [];
    incoming.slice(0, room).forEach((file) => {
      if (!ACCEPTED_TYPES.includes(file.type)) rejected.push(`${file.name} isn't a PNG, JPG, or WebP image.`);
      else if (file.size > MAX_BYTES) rejected.push(`${file.name} is larger than 4MB.`);
      else accepted.push(file);
    });
    if (incoming.length > room) rejected.push(`Only ${MAX_ATTACHMENTS} images can be attached.`);

    setFiles((current) => [...current, ...accepted]);
    setFileError(rejected.join(' '));
  };

  const removeFile = (index) => {
    setFiles((current) => current.filter((_, position) => position !== index));
    setFileError('');
  };

  const canSubmit = form.category && form.title.trim().length >= 4 && form.description.trim().length >= 10;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = { ...form, page_url: window.location.href, ...(context ? { context } : {}) };
      let data;
      if (files.length) {
        // A real FormData instance, and no hand-written Content-Type header — axios
        // adds the boundary itself. Declaring multipart on a plain object is what
        // silently emptied the announcement saves (docs/developer/announcements.md).
        const body = new FormData();
        Object.entries(payload).forEach(([key, value]) => body.append(key, key === 'context' ? JSON.stringify(value) : value));
        files.forEach((file) => body.append('attachments[]', file));
        ({ data } = await axios.post('/feedback/items', body));
      } else {
        ({ data } = await axios.post('/feedback/items', payload));
      }
      setItems((current) => (current === null ? current : [data.feedback, ...current]));
      setForm(emptyForm);
      setFiles([]);
      setFileError('');
      handleToast(data.message || 'Thanks — your suggestion was submitted.', 'success');
      onClose?.();
    } catch (requestError) {
      const body = requestError.response?.data;
      setError(body?.message || Object.values(body?.errors ?? {})[0]?.[0] || 'Unable to submit your suggestion.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleChangelogEntry = (entry) => {
    const next = expandedId === entry.id ? null : entry.id;
    setExpandedId(next);
    if (next === entry.id && !entry.is_read) {
      axios.post('/read-announcement', { announcement_id: entry.id })
        .then(() => setChangelog((current) => current.map((row) => (row.id === entry.id ? { ...row, is_read: true } : row))))
        .catch(() => {});
    }
  };

  // Every hook above runs unconditionally; the modal keeps its loaded lists and any
  // half-typed draft while closed, so reopening it doesn't refetch or lose work.
  if (!open || typeof document === 'undefined') return null;

  const surface = dark ? 'border-[#2a2e39] bg-[#131722] text-[#d1d4dc]' : 'border-slate-200 bg-white text-slate-900';
  const field = dark ? 'border-[#2a2e39] bg-[#0b0e14] text-white' : 'border-slate-200 bg-slate-50 text-slate-900';
  const muted = 'text-[#787b86]';
  const divider = dark ? 'border-[#2a2e39]' : 'border-slate-200';

  const tabButton = (value, label) => (
    <button
      key={value}
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => { setTab(value); setView('form'); }}
      className={`relative pb-2.5 text-sm font-bold transition-colors ${tab === value ? 'text-[#2dd4bf]' : dark ? `${muted} hover:text-white` : `${muted} hover:text-slate-900`}`}
    >
      {label}
      {tab === value && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#2dd4bf]" />}
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex items-end justify-center bg-black/60 p-3 sm:items-center"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <section role="dialog" aria-modal="true" aria-label="Product Hub" className={`flex max-h-[min(88vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-2xl ${surface}`}>
        <div className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${divider}`}>
          {/* Same icon as the chart-header button that opens this, so the modal
              reads as that button's surface rather than an unrelated dialog. */}
          <h2 className={`flex items-center gap-2 text-sm font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>
            <MessageSquarePlus size={16} className="text-[#5eead4]" />
            Product Hub
          </h2>
          <button type="button" onClick={onClose} aria-label="Close Product Hub" className={`rounded-md p-1.5 ${dark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}><X size={17} /></button>
        </div>

        <div className={`mt-3 flex shrink-0 items-center gap-6 border-b px-4 ${divider}`} role="tablist" aria-label="Product Hub sections">
          {tabButton('suggestion', 'Suggestion')}
          {tabButton('changelog', 'Changelog')}
        </div>

        {tab === 'changelog' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {loadingChangelog && <p className={`flex items-center gap-2 py-8 text-xs ${muted}`}><LoaderCircle size={14} className="animate-spin" />Loading updates…</p>}
            {!loadingChangelog && changelogError && (
              <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
                {changelogError}
                <button type="button" onClick={loadChangelog} className="ml-2 font-semibold underline">Retry</button>
              </div>
            )}
            {!loadingChangelog && !changelogError && changelog?.length === 0 && <p className={`py-12 text-center text-xs ${muted}`}>No updates published yet.</p>}
            {!loadingChangelog && !changelogError && (changelog ?? []).map((entry) => (
              <article key={entry.id} className={`border-b py-3 last:border-b-0 ${divider}`}>
                <button type="button" onClick={() => toggleChangelogEntry(entry)} className="flex w-full items-start gap-2 text-left">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${entry.is_read ? 'bg-transparent' : 'bg-[#2dd4bf]'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-xs font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>{entry.title}</span>
                    <span className={`mt-0.5 block text-[10px] ${muted}`}>{entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}</span>
                  </span>
                  <ChevronRight size={14} className={`mt-0.5 shrink-0 transition-transform ${expandedId === entry.id ? 'rotate-90' : ''} ${muted}`} />
                </button>
                {expandedId === entry.id && (
                  /* Admin-authored rich HTML, same trust model as AnnouncementGate.jsx
                     and Pages/Announcements/Index.jsx — see docs/developer/announcements.md. */
                  <div className={`mt-2 break-words pl-3.5 text-xs leading-6 ${muted}`} dangerouslySetInnerHTML={{ __html: entry.message ?? '' }} />
                )}
              </article>
            ))}
            <a href="/updates" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#5eead4]">View all updates<ChevronRight size={13} /></a>
          </div>
        ) : view === 'mine' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <button type="button" onClick={() => setView('form')} className="flex items-center gap-1.5 text-xs font-semibold text-[#5eead4]"><ArrowLeft size={14} />New suggestion</button>
            {loadingItems && <p className={`flex items-center gap-2 py-8 text-xs ${muted}`}><LoaderCircle size={14} className="animate-spin" />Loading your suggestions…</p>}
            {!loadingItems && items?.length === 0 && <p className={`py-12 text-center text-xs ${muted}`}>You haven't submitted a suggestion yet.</p>}
            {!loadingItems && (items ?? []).map((item) => (
              <article key={item.id} className={`mt-3 rounded-lg border p-3 ${field}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-xs font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>{item.title}</div>
                    <div className={`mt-1 text-[10px] uppercase tracking-wider ${muted}`}>{typeLabels[item.category] ?? item.category.replace('_', ' ')} · {new Date(item.createdAt).toLocaleDateString()}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase ${statusStyles[item.status] ?? statusStyles.submitted}`}>{item.status.replace('_', ' ')}</span>
                </div>
                {item.context && <div className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] ${divider} ${muted}`}>{contextChipLabel(item.context)}</div>}
                <p className={`mt-2 line-clamp-3 text-xs leading-5 ${muted}`}>{item.description}</p>
                {item.attachments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.attachments.map((attachment) => (
                      <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className={`h-12 w-12 overflow-hidden rounded-md border ${divider}`}>
                        <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                {item.adminResponse && (
                  <div className="mt-3 rounded-md border border-[#2dd4bf]/25 bg-[#2dd4bf]/5 p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[#5eead4]">Team response</div>
                    <p className="mt-1 text-xs leading-5">{item.adminResponse}</p>
                  </div>
                )}
              </article>
            ))}
            <a href="/feedback" className={`mt-4 inline-flex items-center gap-1 text-xs font-semibold ${muted}`}>Payment or account help<ChevronRight size={13} /></a>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="text-xs font-bold"><span className="text-red-400">*</span> Type <span className={`font-medium ${muted}`}>( Single choice )</span></div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {PRODUCT_TYPES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={form.category === value}
                    onClick={() => setForm((current) => ({ ...current, category: value }))}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      form.category === value
                        ? 'border-[#2dd4bf] bg-[#2dd4bf] text-white'
                        : `${field} hover:border-[#2dd4bf]/60`
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {context && (
                <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${divider} ${muted}`}>
                  <CandlestickChart size={11} className="text-[#5eead4]" />
                  {contextChipLabel(context)}
                </div>
              )}

              <label className="mt-4 block text-xs font-bold">
                <span className="text-red-400">*</span> Summary
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  maxLength={160}
                  required
                  placeholder="One line — what should change?"
                  className={`mt-1.5 h-10 w-full rounded-lg border px-3 text-sm font-medium outline-none focus:border-[#2dd4bf] ${field}`}
                />
              </label>

              <div className="mt-4 text-xs font-bold"><span className="text-red-400">*</span> We're committed to improving</div>
              <div className={`relative mt-1.5 rounded-lg border transition-colors focus-within:border-[#2dd4bf] ${field}`}>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value.slice(0, DETAILS_LIMIT) }))}
                  rows={6}
                  required
                  aria-label="Details"
                  placeholder="Share your ideas or product suggestions here!"
                  className="w-full resize-y bg-transparent p-3 pb-7 text-sm outline-none"
                />
                <span className={`pointer-events-none absolute bottom-2 right-3 text-[10px] ${muted}`}>{form.description.length}/{DETAILS_LIMIT}</span>
              </div>

              <div className="mt-4 text-xs font-bold">Upload Attachment <span className={`font-medium ${muted}`}>( {files.length}/{MAX_ATTACHMENTS} )</span></div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {previews.map((preview, index) => (
                  <div key={preview.url} className={`relative h-16 w-16 overflow-hidden rounded-lg border ${divider}`}>
                    <img src={preview.url} alt={preview.file.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      aria-label={`Remove ${preview.file.name}`}
                      className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-md bg-black/70 text-white"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                {files.length < MAX_ATTACHMENTS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Add an image"
                    className={`flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed ${dark ? 'border-[#2a2e39] hover:border-[#2dd4bf]' : 'border-slate-300 hover:border-[#2dd4bf]'} ${muted}`}
                  >
                    <Plus size={16} />
                    <ImagePlus size={12} />
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                multiple
                className="hidden"
                onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }}
              />
              <p className={`mt-2 text-[10px] ${muted}`}>PNG, JPG, or WebP · up to 4MB each</p>
              {fileError && <p className="mt-2 rounded-md bg-red-500/10 p-2 text-[11px] text-red-400">{fileError}</p>}
              {error && <p className="mt-3 rounded-md bg-red-500/10 p-2.5 text-xs text-red-400">{error}</p>}
            </div>

            <div className={`flex shrink-0 items-center gap-3 border-t px-4 py-3 ${divider}`}>
              <button type="button" onClick={() => setView('mine')} className={`flex items-center gap-1.5 text-xs font-semibold ${muted} hover:text-[#5eead4]`}>
                <MessageSquarePlus size={15} />
                My Suggestions
              </button>
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="ml-auto flex h-10 min-w-32 items-center justify-center gap-2 rounded-lg bg-[#2dd4bf] px-5 text-xs font-bold text-white transition-colors hover:bg-[#14b8a6] disabled:opacity-40"
              >
                {submitting ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>,
    document.body,
  );
}
