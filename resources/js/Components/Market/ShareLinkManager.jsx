import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Check, Copy, Link2, ShieldAlert, Trash2 } from 'lucide-react';
import { useTheme } from '../../Context/ThemeContext';
import { useConfirm } from '../../Hooks/useConfirm';
import ToggleSwitch from './ToggleSwitch';

const EMPTY_FORM = {
  label: '',
  scopeType: 'session',
  sessionId: '',
  rangeStart: '',
  rangeEnd: '',
  tradeIdsText: '',
  includeJournal: true,
  includeSnapshots: true,
  includeAnalytics: true,
  expiresAt: '',
};

function toUnixSeconds(datetimeLocalValue) {
  if (!datetimeLocalValue) return null;
  const parsed = new Date(datetimeLocalValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor(parsed.getTime() / 1000);
}

function formatDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scopeSummary(shareLink) {
  if (shareLink.scopeType === 'session') return `Session #${shareLink.sessionId ?? '—'}`;
  if (shareLink.scopeType === 'date_range') return 'Date range';
  if (shareLink.scopeType === 'trade_ids') return `${(shareLink.tradeIds ?? []).length} selected trade(s)`;
  return shareLink.scopeType;
}

function statusOf(shareLink) {
  if (shareLink.revokedAt) return { label: 'Revoked', tone: 'loss' };
  if (shareLink.expiresAt && new Date(shareLink.expiresAt).getTime() <= Date.now()) return { label: 'Expired', tone: 'loss' };
  return { label: 'Active', tone: 'win' };
}

export default function ShareLinkManager() {
  const { theme } = useTheme();
  const isDark = theme === 'bg-skin-black';
  const { confirm, confirmElement } = useConfirm();
  const [shareLinks, setShareLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [revealedLink, setRevealedLink] = useState(null); // { url, label } — one-time reveal only
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/market-backtest/share-links');
      setShareLinks(response.data?.shareLinks ?? []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Unable to load share links.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setCopied(false);

    const payload = {
      label: form.label || null,
      scope_type: form.scopeType,
      include_journal: form.includeJournal,
      include_snapshots: form.includeSnapshots,
      include_analytics: form.includeAnalytics,
      expires_at: form.expiresAt || null,
    };

    if (form.scopeType === 'session') {
      payload.session_id = Number(form.sessionId) || null;
    } else if (form.scopeType === 'date_range') {
      payload.range_start_time = toUnixSeconds(form.rangeStart);
      payload.range_end_time = toUnixSeconds(form.rangeEnd);
    } else if (form.scopeType === 'trade_ids') {
      // v1: comma-separated trade IDs. Could be upgraded later to a real trade picker UI
      // (e.g. reusing TradeReport's table with row checkboxes) once that's worth building.
      payload.trade_ids = form.tradeIdsText
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
    }

    try {
      const response = await axios.post('/market-backtest/share-links', payload);
      setRevealedLink({ url: response.data?.url ?? '', label: form.label || 'Shared Trade Review' });
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      const validation = err.response?.data?.errors;
      setError(validation ? Object.values(validation).flat()[0] : (err.response?.data?.message ?? 'Unable to create share link.'));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (shareLink) => {
    if (!(await confirm(`Revoke the share link "${shareLink.label || 'Untitled'}"? The mentor will immediately lose access.`, { title: 'Revoke share link?', confirmLabel: 'Revoke' }))) return;
    try {
      await axios.delete(`/market-backtest/share-links/${shareLink.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Unable to revoke share link.');
    }
  };

  const copyRevealedLink = async () => {
    if (!revealedLink?.url) return;
    try {
      await navigator.clipboard.writeText(revealedLink.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const surface = isDark ? 'border-gray-800 bg-skin-black text-white' : 'border-slate-200 bg-white text-slate-900';
  const field = isDark ? 'border-gray-700 bg-black-table-color text-white' : 'border-slate-300 bg-white text-slate-900';
  const muted = isDark ? 'text-gray-400' : 'text-slate-600';
  const button = isDark ? 'bg-skin-black-light text-gray-200 hover:bg-gray-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200';

  return (
    <div className={`rounded-lg border p-4 ${surface}`}>
      {confirmElement}
      <div className="mb-4 flex items-center gap-2" data-tour="mentor-intro">
        <Link2 size={18} />
        <div>
          <h2 className="text-sm font-semibold">Mentor Review Links</h2>
          <p className={`mt-1 text-xs ${muted}`}>Generate a revocable, read-only public link so a mentor can review a scoped slice of your closed trades without logging in.</p>
        </div>
      </div>

      {error && <div className="mb-3 rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-200">{error}</div>}

      {revealedLink && (
        <div className={`mb-4 rounded-lg border p-3 ${isDark ? 'border-amber-600 bg-amber-950/30' : 'border-amber-400 bg-amber-50'}`}>
          <div className="flex items-start gap-2">
            <ShieldAlert size={16} className={isDark ? 'mt-0.5 text-amber-300' : 'mt-0.5 text-amber-600'} />
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-semibold ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
                Save this link now — it cannot be shown again. You can revoke it below at any time.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-xs ${isDark ? 'bg-black-table-color text-gray-200' : 'bg-white text-slate-800'}`}>
                  {revealedLink.url}
                </code>
                <button type="button" onClick={copyRevealedLink} className={`inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-semibold ${button}`}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" onClick={() => setRevealedLink(null)} className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold ${button}`}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="mb-6 grid gap-3 rounded-lg border p-3 md:grid-cols-2" style={{ borderColor: 'inherit' }}>
        <input
          value={form.label}
          onChange={(e) => updateForm({ label: e.target.value })}
          maxLength={120}
          placeholder='Label (e.g. "Q3 review for coach")'
          className={`h-9 w-full rounded border px-3 text-sm md:col-span-2 ${field}`}
        />

        <div className="md:col-span-2" data-tour="mentor-scope">
          <span className={`mb-1 block text-[11px] uppercase tracking-wide ${muted}`}>Scope</span>
          <div className="flex flex-wrap gap-3">
            {[
              ['session', 'Session'],
              ['date_range', 'Date range'],
              ['trade_ids', 'Specific trades'],
            ].map(([value, text]) => (
              <label key={value} className={`flex items-center gap-1.5 text-xs ${muted}`}>
                <input
                  type="radio"
                  name="scopeType"
                  value={value}
                  checked={form.scopeType === value}
                  onChange={() => updateForm({ scopeType: value })}
                />
                {text}
              </label>
            ))}
          </div>
        </div>

        {form.scopeType === 'session' && (
          // No dedicated "list my sessions" endpoint exists in this app yet, so this is a
          // plain numeric session-id input rather than a dropdown. The server still verifies
          // ownership of whatever id is submitted.
          <input
            type="number"
            min={1}
            value={form.sessionId}
            onChange={(e) => updateForm({ sessionId: e.target.value })}
            placeholder="Session ID"
            className={`h-9 w-full rounded border px-3 text-sm md:col-span-2 ${field}`}
          />
        )}

        {form.scopeType === 'date_range' && (
          <>
            <label className="block">
              <span className={`mb-1 block text-[11px] uppercase tracking-wide ${muted}`}>From</span>
              <input
                type="datetime-local"
                value={form.rangeStart}
                onChange={(e) => updateForm({ rangeStart: e.target.value })}
                className={`h-9 w-full rounded border px-3 text-sm ${field}`}
              />
            </label>
            <label className="block">
              <span className={`mb-1 block text-[11px] uppercase tracking-wide ${muted}`}>To</span>
              <input
                type="datetime-local"
                value={form.rangeEnd}
                onChange={(e) => updateForm({ rangeEnd: e.target.value })}
                className={`h-9 w-full rounded border px-3 text-sm ${field}`}
              />
            </label>
          </>
        )}

        {form.scopeType === 'trade_ids' && (
          // v1: a simple comma-separated position-id input. Could be upgraded later to a
          // real multi-select trade picker UI.
          <input
            value={form.tradeIdsText}
            onChange={(e) => updateForm({ tradeIdsText: e.target.value })}
            placeholder="Trade IDs, comma separated (e.g. 101, 104, 110)"
            className={`h-9 w-full rounded border px-3 text-sm md:col-span-2 ${field}`}
          />
        )}

        <label className="block">
          <span className={`mb-1 block text-[11px] uppercase tracking-wide ${muted}`}>Expires (optional)</span>
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => updateForm({ expiresAt: e.target.value })}
            className={`h-9 w-full rounded border px-3 text-sm ${field}`}
          />
        </label>

        <div className="flex flex-wrap items-center gap-4 md:col-span-2" data-tour="mentor-includes">
          <ToggleSwitch checked={form.includeJournal} onChange={(e) => updateForm({ includeJournal: e.target.checked })} label="Include journal notes" isDark={isDark} />
          <ToggleSwitch checked={form.includeSnapshots} onChange={(e) => updateForm({ includeSnapshots: e.target.checked })} label="Include chart snapshots" isDark={isDark} />
          <ToggleSwitch checked={form.includeAnalytics} onChange={(e) => updateForm({ includeAnalytics: e.target.checked })} label="Include analytics" isDark={isDark} />
        </div>

        <div className="md:col-span-2">
          <button type="submit" disabled={saving} className="rounded bg-teal-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? 'Creating…' : 'Create share link'}
          </button>
        </div>
      </form>

      <div data-tour="mentor-links">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide">Existing links</h3>
        {loading ? (
          <p className={`text-xs ${muted}`}>Loading…</p>
        ) : shareLinks.length ? (
          <div className="space-y-2">
            {shareLinks.map((shareLink) => {
              const status = statusOf(shareLink);
              return (
                <div key={shareLink.id} className={`flex flex-wrap items-center justify-between gap-2 rounded border p-3 ${field}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{shareLink.label || 'Untitled link'}</div>
                    <div className={`mt-1 text-xs ${muted}`}>
                      {scopeSummary(shareLink)} · {shareLink.viewCount} view{shareLink.viewCount === 1 ? '' : 's'}
                      {shareLink.lastViewedAt ? ` · last viewed ${formatDateTime(shareLink.lastViewedAt)}` : ''}
                      {shareLink.expiresAt ? ` · expires ${formatDateTime(shareLink.expiresAt)}` : ' · no expiry'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${status.tone === 'win' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                      {status.label}
                    </span>
                    {status.label === 'Active' && (
                      <button type="button" onClick={() => revoke(shareLink)} className="inline-flex h-8 items-center gap-1 rounded-md bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-600">
                        <Trash2 size={13} />
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={`text-xs ${muted}`}>No share links yet.</p>
        )}
      </div>
    </div>
  );
}
