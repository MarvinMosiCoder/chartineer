import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../Context/ThemeContext';
import { useConfirm } from '../../Hooks/useConfirm';

const TARGET_FIELDS = [
  { key: 'symbol', label: 'Symbol', required: true },
  { key: 'side', label: 'Side', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'entry_price', label: 'Entry Price', required: true },
  { key: 'exit_price', label: 'Exit Price', required: false },
  { key: 'fee', label: 'Fee', required: false },
  { key: 'realized_pnl', label: 'Realized PnL', required: false },
  { key: 'opened_at_time', label: 'Opened At', required: false },
  { key: 'closed_at_time', label: 'Closed At', required: false },
];

const EMPTY_MAPPING = TARGET_FIELDS.reduce((acc, field) => ({ ...acc, [field.key]: '' }), {});

const TIMEZONE_OPTIONS = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

const ACTIVE_STATUSES = ['pending', 'processing'];

const STATUS_STYLES = {
  mapping: 'bg-slate-500/20 text-slate-400',
  pending: 'bg-amber-500/20 text-amber-400',
  processing: 'bg-amber-500/20 text-amber-400',
  ready: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
};

function formatTimestamp(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatNumber(value, digits = 8) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function ImportedTrades() {
  const { theme } = useTheme();
  const isDark = theme === 'bg-skin-black';
  const { confirm, confirmElement } = useConfirm();

  const [uploadForm, setUploadForm] = useState({ broker: '', file: null });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState(EMPTY_MAPPING);
  const [timezone, setTimezone] = useState('UTC');
  const [customTimezone, setCustomTimezone] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState('');

  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesError, setBatchesError] = useState('');

  const [trades, setTrades] = useState([]);
  const [tradesLoading, setTradesLoading] = useState(true);
  const [tradesError, setTradesError] = useState('');
  const [tradesPagination, setTradesPagination] = useState(null);
  const [tradeFilterBatchId, setTradeFilterBatchId] = useState('');

  const loadBatches = async () => {
    setBatchesLoading(true);
    try {
      const response = await axios.get('/imported-trades/batches');
      setBatches(response.data?.batches ?? []);
      setBatchesError('');
    } catch (err) {
      setBatchesError(err.response?.data?.message ?? 'Unable to load import batches.');
    } finally {
      setBatchesLoading(false);
    }
  };

  const loadTrades = async (page = 1, batchId = tradeFilterBatchId) => {
    setTradesLoading(true);
    try {
      const params = { page };
      if (batchId) params.batch_id = batchId;
      const response = await axios.get('/imported-trades/items', { params });
      setTrades(response.data?.trades ?? []);
      setTradesPagination(response.data?.pagination ?? null);
      setTradesError('');
    } catch (err) {
      setTradesError(err.response?.data?.message ?? 'Unable to load imported trades.');
    } finally {
      setTradesLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
    loadTrades(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Light polling while a batch is still pending/processing so status/counts update
  // without requiring a manual refresh.
  useEffect(() => {
    const hasActiveBatch = batches.some((batch) => ACTIVE_STATUSES.includes(batch.status));
    if (!hasActiveBatch) return undefined;
    const interval = setInterval(() => {
      loadBatches();
      loadTrades(1, tradeFilterBatchId);
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, tradeFilterBatchId]);

  const resetUploadFlow = () => {
    setPreview(null);
    setMapping(EMPTY_MAPPING);
    setTimezone('UTC');
    setCustomTimezone('');
    setCommitError('');
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!uploadForm.file) {
      setUploadError('Choose a CSV file to import.');
      return;
    }
    setUploading(true);
    setUploadError('');
    const formData = new FormData();
    formData.append('file', uploadForm.file);
    if (uploadForm.broker) formData.append('broker', uploadForm.broker);
    try {
      const response = await axios.post('/imported-trades/batches/preview', formData);
      setPreview({
        batchId: response.data.batchId,
        headers: response.data.headers ?? [],
        previewRows: response.data.previewRows ?? [],
      });
      setMapping(EMPTY_MAPPING);
      setTimezone('UTC');
      setCustomTimezone('');
      setCommitError('');
      setUploadForm((prev) => ({ ...prev, file: null }));
      await loadBatches();
    } catch (err) {
      const errors = err.response?.data?.errors;
      setUploadError(errors ? Object.values(errors).flat()[0] : (err.response?.data?.message ?? 'Unable to upload file.'));
    } finally {
      setUploading(false);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    const missing = TARGET_FIELDS.filter((field) => field.required && !mapping[field.key]);
    if (missing.length) {
      setCommitError(`Map a column for: ${missing.map((field) => field.label).join(', ')}.`);
      return;
    }
    const effectiveTimezone = timezone === 'Other' ? customTimezone.trim() : timezone;
    if (!effectiveTimezone) {
      setCommitError('Choose or enter a source timezone.');
      return;
    }
    setCommitting(true);
    setCommitError('');
    const columnMapping = {};
    TARGET_FIELDS.forEach((field) => {
      if (mapping[field.key]) columnMapping[field.key] = mapping[field.key];
    });
    try {
      await axios.post(`/imported-trades/batches/${preview.batchId}/commit`, {
        column_mapping: columnMapping,
        source_timezone: effectiveTimezone,
      });
      resetUploadFlow();
      await loadBatches();
      await loadTrades(1, tradeFilterBatchId);
    } catch (err) {
      const errors = err.response?.data?.errors;
      setCommitError(errors ? Object.values(errors).flat()[0] : (err.response?.data?.message ?? 'Unable to commit import.'));
    } finally {
      setCommitting(false);
    }
  };

  const deleteBatch = async (batch) => {
    if (!(await confirm(`Delete import batch "${batch.originalFilename ?? batch.id}"? Its imported trades will be removed too.`, { title: 'Delete import batch?', confirmLabel: 'Delete' }))) return;
    try {
      await axios.delete(`/imported-trades/batches/${batch.id}`);
      if (preview?.batchId === batch.id) resetUploadFlow();
      await loadBatches();
      await loadTrades(1, tradeFilterBatchId);
    } catch (err) {
      setBatchesError(err.response?.data?.message ?? 'Unable to delete batch.');
    }
  };

  const changeTradeFilter = async (value) => {
    setTradeFilterBatchId(value);
    await loadTrades(1, value);
  };

  const surface = isDark ? 'border-gray-800 bg-skin-black text-white' : 'border-slate-200 bg-white text-slate-900';
  const field = isDark ? 'border-gray-700 bg-black-table-color text-white' : 'border-slate-300 bg-white text-slate-900';
  const muted = isDark ? 'text-gray-400' : 'text-slate-600';
  const button = isDark ? 'bg-skin-black-light text-gray-200 hover:bg-gray-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200';
  const rowBorder = isDark ? 'border-gray-800' : 'border-slate-200';

  return (
    <div data-tour="journal-import" className={`rounded-lg border p-4 ${surface}`}>
      {confirmElement}
      <div className="mb-4">
        <h2 className="text-sm font-semibold">Imported Trades</h2>
        <p className={`mt-1 text-xs ${muted}`}>Bring in real historical fills from a broker or exchange CSV export.</p>
      </div>

      <div className="mb-4 rounded border border-amber-700/50 bg-amber-500/10 p-3 text-xs text-amber-500">
        Imported trades are a separate real-trade record — they are never mixed into your simulated backtest analytics or reports.
      </div>

      {!preview && (
        <form onSubmit={handleUpload} className={`rounded border p-3 ${field}`}>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]">
            <input
              value={uploadForm.broker}
              onChange={(e) => setUploadForm((prev) => ({ ...prev, broker: e.target.value }))}
              maxLength={64}
              placeholder="Broker/exchange (optional)"
              className={`h-9 w-full rounded border px-3 text-sm ${field}`}
            />
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => setUploadForm((prev) => ({ ...prev, file: e.target.files?.[0] ?? null }))}
              className={`h-9 w-full rounded border px-2 py-1.5 text-xs ${field}`}
            />
            <button disabled={uploading} className="h-9 rounded bg-teal-600 px-4 text-xs font-semibold text-white disabled:opacity-50">
              {uploading ? 'Uploading…' : 'Upload CSV'}
            </button>
          </div>
          {uploadError && <p className="mt-2 text-xs text-red-400">{uploadError}</p>}
        </form>
      )}

      {preview && (
        <div className={`rounded border p-3 ${field}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Map columns and confirm timezone</h3>
            <button type="button" onClick={resetUploadFlow} className={`rounded px-2 py-1 text-xs ${button}`}>Cancel</button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TARGET_FIELDS.map((f) => (
              <label key={f.key} className={`text-[11px] ${muted}`}>
                {f.label}{f.required ? ' *' : ''}
                <select
                  value={mapping[f.key]}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className={`mt-1 h-9 w-full rounded border px-2 text-xs ${field}`}
                >
                  <option value="">{f.required ? 'Select column…' : 'Not mapped'}</option>
                  {preview.headers.map((header, idx) => (
                    <option key={`${f.key}-${idx}`} value={header}>{String(header)}</option>
                  ))}
                </select>
              </label>
            ))}

            <label className={`text-[11px] ${muted}`}>
              Source timezone *
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={`mt-1 h-9 w-full rounded border px-2 text-xs ${field}`}
              >
                {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                <option value="Other">Other (enter IANA name)</option>
              </select>
            </label>
            {timezone === 'Other' && (
              <label className={`text-[11px] ${muted}`}>
                IANA timezone name
                <input
                  value={customTimezone}
                  onChange={(e) => setCustomTimezone(e.target.value)}
                  placeholder="e.g. Asia/Manila"
                  className={`mt-1 h-9 w-full rounded border px-2 text-xs ${field}`}
                />
              </label>
            )}
          </div>

          {preview.previewRows.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-[11px]">
                <thead>
                  <tr className={`border-b ${rowBorder}`}>
                    {preview.headers.map((header, idx) => (
                      <th key={idx} className={`whitespace-nowrap px-2 py-1 font-semibold ${muted}`}>{String(header)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.previewRows.slice(0, 8).map((row, rowIdx) => (
                    <tr key={rowIdx} className={`border-b ${rowBorder}`}>
                      {preview.headers.map((_, colIdx) => (
                        <td key={colIdx} className="whitespace-nowrap px-2 py-1">{row[colIdx] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {commitError && <p className="mt-2 text-xs text-red-400">{commitError}</p>}
          <div className="mt-3">
            <button
              type="button"
              disabled={committing}
              onClick={handleCommit}
              className="rounded bg-teal-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {committing ? 'Starting import…' : 'Commit import'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold">Import batches</h3>
          <button type="button" onClick={loadBatches} className={`rounded px-2 py-1 text-xs ${button}`}>Refresh</button>
        </div>
        {batchesError && <p className="mt-1 text-xs text-red-400">{batchesError}</p>}
        <div className="mt-2 space-y-2">
          {batchesLoading ? (
            <p className={`text-xs ${muted}`}>Loading batches…</p>
          ) : batches.length ? batches.map((batch) => (
            <div key={batch.id} className={`flex flex-wrap items-center justify-between gap-2 rounded border p-2 ${field}`}>
              <div>
                <div className="text-xs font-semibold">{batch.originalFilename ?? `Batch #${batch.id}`}{batch.broker ? ` · ${batch.broker}` : ''}</div>
                <p className={`mt-0.5 text-[11px] ${muted}`}>
                  {batch.totalRows ?? 0} rows · {batch.importedRows} imported · {batch.duplicateRows} duplicates · {batch.errorRows} errors
                  {batch.error ? ` · ${batch.error}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-1 text-[11px] font-semibold ${STATUS_STYLES[batch.status] ?? 'bg-slate-500/20 text-slate-400'}`}>{batch.status}</span>
                <button type="button" onClick={() => changeTradeFilter(String(batch.id))} className={`rounded px-2 py-1 text-xs ${button}`}>View trades</button>
                <button type="button" onClick={() => deleteBatch(batch)} className="rounded bg-red-700 px-2 py-1 text-xs text-white">Delete</button>
              </div>
            </div>
          )) : <p className={`text-xs ${muted}`}>No import batches yet.</p>}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">Imported trades</h3>
          <div className="flex items-center gap-2">
            <select
              value={tradeFilterBatchId}
              onChange={(e) => changeTradeFilter(e.target.value)}
              className={`h-8 rounded border px-2 text-xs ${field}`}
            >
              <option value="">All batches</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>{batch.originalFilename ?? `Batch #${batch.id}`}</option>
              ))}
            </select>
            <button type="button" onClick={() => loadTrades(1, tradeFilterBatchId)} className={`rounded px-2 py-1 text-xs ${button}`}>Refresh</button>
          </div>
        </div>
        {tradesError && <p className="mt-1 text-xs text-red-400">{tradesError}</p>}
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className={`border-b ${rowBorder}`}>
                {['Symbol', 'Side', 'Qty', 'Entry', 'Exit', 'PnL', 'Opened', 'Closed'].map((label) => (
                  <th key={label} className={`whitespace-nowrap px-2 py-1 font-semibold ${muted}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tradesLoading ? (
                <tr><td colSpan={8} className={`px-2 py-3 text-center ${muted}`}>Loading trades…</td></tr>
              ) : trades.length ? trades.map((trade) => (
                <tr key={trade.id} className={`border-b ${rowBorder}`}>
                  <td className="whitespace-nowrap px-2 py-1 font-semibold">{trade.symbol}</td>
                  <td className={`whitespace-nowrap px-2 py-1 ${trade.side === 'long' ? 'text-emerald-500' : 'text-red-400'}`}>{trade.side}</td>
                  <td className="whitespace-nowrap px-2 py-1">{formatNumber(trade.quantity, 10)}</td>
                  <td className="whitespace-nowrap px-2 py-1">{formatNumber(trade.entryPrice)}</td>
                  <td className="whitespace-nowrap px-2 py-1">{formatNumber(trade.exitPrice)}</td>
                  <td className={`whitespace-nowrap px-2 py-1 ${Number(trade.realizedPnl) > 0 ? 'text-emerald-500' : Number(trade.realizedPnl) < 0 ? 'text-red-400' : ''}`}>{formatNumber(trade.realizedPnl)}</td>
                  <td className="whitespace-nowrap px-2 py-1">{formatTimestamp(trade.openedAtTime)}</td>
                  <td className="whitespace-nowrap px-2 py-1">{formatTimestamp(trade.closedAtTime)}</td>
                </tr>
              )) : <tr><td colSpan={8} className={`px-2 py-3 text-center ${muted}`}>No imported trades yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {tradesPagination && tradesPagination.lastPage > 1 && (
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={tradesPagination.currentPage <= 1}
              onClick={() => loadTrades(tradesPagination.currentPage - 1, tradeFilterBatchId)}
              className={`rounded px-2 py-1 text-xs ${button} disabled:opacity-50`}
            >Previous</button>
            <span className={`text-xs ${muted}`}>Page {tradesPagination.currentPage} of {tradesPagination.lastPage}</span>
            <button
              type="button"
              disabled={tradesPagination.currentPage >= tradesPagination.lastPage}
              onClick={() => loadTrades(tradesPagination.currentPage + 1, tradeFilterBatchId)}
              className={`rounded px-2 py-1 text-xs ${button} disabled:opacity-50`}
            >Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
